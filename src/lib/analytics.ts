// Product analytics. Browser only, and a full no-op unless NEXT_PUBLIC_POSTHOG_KEY is
// set: the vendor bundle is behind a dynamic import, so an unconfigured build never pays
// for it. The taxonomy below is the whole contract - adding an event means adding a
// variant here and a row in docs/design/ANALYTICS.md in the same change.
//
// What never leaves the device: the display name, chat text, video ids and titles, room
// codes (the rejoin check keeps a salted local marker instead), and error stacks. The room
// page path *is* the room code, so PostHog's own URL and referrer properties are denied at
// init as well: the capture flags do not cover them. See ANALYTICS.md.
import type { Genre } from "./atmosphereGenre";
import { setLogErrorSink } from "./logger";
import { readPref, writePref } from "./prefs";

const DEVICE_ID_KEY = "karaoke-device-id";
const VISITED_ROOMS_KEY = "karaoke-rooms-visited";
const VISITED_ROOMS_SALT_KEY = "karaoke-rooms-salt";
const VISITED_ROOMS_LIMIT = 20;
const DEFAULT_HOST = "https://us.i.posthog.com";
const MAX_APP_ERRORS_PER_SESSION = 10;
const MAX_ERROR_MESSAGE_LENGTH = 120;
const MAX_PENDING_EVENTS = 50;
const CHAT_SHORT_MAX = 20;
const CHAT_MEDIUM_MAX = 80;

// PostHog attaches these to every capture from the page's own URL, whatever the capture
// flags say, and the room page is `/room/<CODE>`: without this the room code (and, on a
// legacy `?name=` share link, the display name) would ride on every event, and the
// `$initial_*` and `$session_entry_*` copies would be frozen in localStorage for good.
export const POSTHOG_PROPERTY_DENYLIST = [
  "$current_url",
  "$pathname",
  "$host",
  "$referrer",
  "$referring_domain",
  "$initial_current_url",
  "$initial_pathname",
  "$initial_host",
  "$initial_referrer",
  "$initial_referring_domain",
  "$session_entry_url",
  "$session_entry_pathname",
  "$session_entry_host",
  "$session_entry_referrer",
  "$session_entry_referring_domain",
  "$raw_user_agent",
];

const URL_SHAPED = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * The last gate before a property leaves the page. It drops the denylist by name and any
 * value that is a URL whatever it is called, so a vendor upgrade that renames or adds a
 * URL property cannot start shipping room codes.
 */
export function sanitizeProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (POSTHOG_PROPERTY_DENYLIST.includes(key)) continue;
    if (typeof value === "string" && URL_SHAPED.test(value)) continue;
    safe[key] = value;
  }
  return safe;
}

export type ChatLengthBucket = "short" | "medium" | "long";
export type TurnEndReason = "self" | "skip" | "timeout";
export type JoinRole = "creator" | "joiner";

/**
 * Every event the app may send, with its exact payload. An `undefined` entry takes no props.
 */
interface EventProps {
  room_created: undefined;
  room_joined: { role: JoinRole; rejoin: boolean };
  queue_joined: undefined;
  turn_started: undefined;
  turn_finished: { duration_s: number; finished_by: TurnEndReason };
  song_loaded: { genre: Genre | "unknown"; has_search: boolean };
  reaction_sent: { emoji: string };
  chat_sent: { length_bucket: ChatLengthBucket };
  audio_recover_tapped: undefined;
  mic_restart_tapped: undefined;
  bt_notice_shown: undefined;
  playback_blocked_shown: undefined;
  app_error: { namespace: string; message: string };
}

export type AnalyticsEvent = keyof EventProps;
type EventsWithoutProps = { [K in AnalyticsEvent]: EventProps[K] extends undefined ? K : never }[AnalyticsEvent];
type EventsWithProps = Exclude<AnalyticsEvent, EventsWithoutProps>;

type PostHogClient = {
  init: (key: string, config: Record<string, unknown>) => unknown;
  capture: (event: string, props?: Record<string, unknown>) => unknown;
};

let client: PostHogClient | null = null;
let loading = false;
let initialized = false;
let disabled = false;
let appErrorCount = 0;
const pending: Array<{ event: AnalyticsEvent; props?: Record<string, unknown> }> = [];

function posthogKey(): string | undefined {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY || undefined;
}

// EU or US, whichever the deploy points at. Anything that is not an https URL falls back
// rather than sending events at a typo.
function posthogHost(): string {
  const configured = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!configured) return DEFAULT_HOST;
  try {
    const url = new URL(configured);
    return url.protocol === "https:" ? url.origin : DEFAULT_HOST;
  } catch {
    return DEFAULT_HOST;
  }
}

function doNotTrack(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as unknown as { doNotTrack?: string | null; msDoNotTrack?: string | null };
  const win = window as unknown as { doNotTrack?: string | null };
  return [nav.doNotTrack, nav.msDoNotTrack, win.doNotTrack].some(
    (signal) => signal === "1" || signal === "yes",
  );
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Anonymous, per-browser, and never joined to the display name the user picked. */
function deviceId(): string {
  const existing = readPref(DEVICE_ID_KEY);
  if (existing) return existing.slice(0, 64);
  const created = randomId();
  writePref(DEVICE_ID_KEY, created);
  return created;
}

// Per-device and random, so the markers below mean nothing anywhere else: the same room
// code produces a different marker on every browser.
function visitSalt(): string {
  const existing = readPref(VISITED_ROOMS_SALT_KEY);
  if (existing) return existing;
  const created = randomId();
  writePref(VISITED_ROOMS_SALT_KEY, created);
  return created;
}

// A local lookup key for "have I been here before", and nothing more. It is a short
// digest of a small code, so it is not a protection of the room code and must never be
// sent anywhere: the salt is what keeps it from linking a device to a room elsewhere.
function roomVisitMarker(code: string): string {
  const salted = `${visitSalt()}:${code}`;
  let hash = 5381;
  for (let i = 0; i < salted.length; i++) hash = ((hash << 5) + hash + salted.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

/** Records this room as visited and answers whether it already was. Local only. */
export function markRoomVisited(roomCode: string): boolean {
  const marker = roomVisitMarker(roomCode.toUpperCase());
  const stored = readPref(VISITED_ROOMS_KEY)?.split(",").filter(Boolean) ?? [];
  const seen = stored.includes(marker);
  const next = [...stored.filter((entry) => entry !== marker), marker].slice(-VISITED_ROOMS_LIMIT);
  writePref(VISITED_ROOMS_KEY, next.join(","));
  return seen;
}

export function chatLengthBucket(length: number): ChatLengthBucket {
  if (length <= CHAT_SHORT_MAX) return "short";
  if (length <= CHAT_MEDIUM_MAX) return "medium";
  return "long";
}

// Analytics is never load-bearing, and `track` sits inside the audio-recovery handlers:
// a vendor that throws must not stop the tap that brings the sound back.
function capture(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  try {
    client?.capture(event, props);
  } catch {
    // swallowed on purpose
  }
}

function flush(): void {
  if (!client) return;
  for (const queued of pending.splice(0)) capture(queued.event, queued.props);
}

function load(key: string): void {
  if (loading) return;
  loading = true;
  void import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: posthogHost(),
        defaults: "2025-05-24",
        // The taxonomy is the product, so nothing is collected that the app did not name:
        // no autocapture, no pageviews, no session replay, no surveys, no exception hooks.
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_exceptions: false,
        disable_session_recording: true,
        disable_surveys: true,
        respect_dnt: true,
        // The capture flags above do not touch the default properties, which is where the
        // URL of `/room/<CODE>` lives. These four are what cover them.
        property_denylist: POSTHOG_PROPERTY_DENYLIST,
        sanitize_properties: sanitizeProperties,
        mask_personal_data_properties: true,
        disable_capture_url_hashes: true,
        persistence: "localStorage",
        person_profiles: "never",
        bootstrap: { distinctID: deviceId() },
      });
      client = posthog as unknown as PostHogClient;
      flush();
    })
    .catch(() => {
      // Analytics is never load-bearing: a blocked or failed vendor bundle stops events
      // and nothing else.
      disabled = true;
      pending.length = 0;
    });
}

/**
 * Safe to call repeatedly. Returns without touching the network when the key is missing,
 * on the server, or when the browser asked not to be tracked.
 */
export function initAnalytics(): void {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;

  setLogErrorSink((entry) => {
    if (appErrorCount >= MAX_APP_ERRORS_PER_SESSION) return;
    appErrorCount++;
    track("app_error", { namespace: entry.namespace, message: errorMessage(entry.message, entry.details) });
  });

  const key = posthogKey();
  if (!key || doNotTrack()) {
    disabled = true;
    return;
  }
  load(key);
}

/**
 * False when nothing will ever be sent: no key, Do Not Track, or a vendor bundle that
 * failed to load. Call it before doing any local work an event needs, so a browser that
 * asked not to be tracked is not left with state it never agreed to.
 */
export function analyticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (!initialized) initAnalytics();
  return !disabled;
}

// The log message plus an Error's own message, never its stack and never the rest of the
// details, which can hold device labels and raw payloads.
function errorMessage(message: string, details: unknown[]): string {
  const cause = details.find((detail) => detail instanceof Error);
  const full = cause instanceof Error ? `${message} ${cause.message}`.trim() : message;
  return full.slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

export function track<E extends EventsWithoutProps>(event: E): void;
export function track<E extends EventsWithProps>(event: E, props: EventProps[E]): void;
export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (!initialized) initAnalytics();
  if (disabled) return;
  if (client) {
    capture(event, props);
    return;
  }
  // The vendor bundle is still in flight, or the first event beat init: hold a bounded
  // number so a room_created on the way to the room page is not lost.
  if (pending.length < MAX_PENDING_EVENTS) pending.push({ event, props });
}
