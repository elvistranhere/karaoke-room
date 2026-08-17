// Every HTTP call the app makes to our own backend goes through here. The base is the
// PartyKit host the room socket already uses, so a client that can reach the room can
// reach the token and search endpoints, with no Next origin in the path.
//
// The Next routes under /api are the fallback, not dead weight: they answer for shells
// cached before this switch, and for any browser the worker refuses or cannot be reached
// from. A Vercel preview gets a per-deployment origin that no static allowlist can
// enumerate, so "the worker said 403" has to degrade to same-origin rather than to a dead
// microphone.

import { createLogger } from "./logger";

const log = createLogger("apiBase");

const DEFAULT_PARTY_HOST = "localhost:1999";
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/;

export function partyHost(): string {
  return process.env.NEXT_PUBLIC_PARTY_HOST ?? DEFAULT_PARTY_HOST;
}

export function partyOrigin(): string {
  const host = partyHost();
  return `${LOCAL_HOST_RE.test(host) ? "http" : "https"}://${host}`;
}

export interface LiveKitTokenParams {
  room: string;
  name: string;
  keyHint?: "next";
}

function tokenQuery(params: LiveKitTokenParams): string {
  const query = new URLSearchParams({ room: params.room, name: params.name });
  if (params.keyHint) query.set("keyHint", params.keyHint);
  return query.toString();
}

// The token party is sharded by room code, so the room appears both in the party id and
// in the query the minter validates; the endpoint refuses a request where they disagree.
export function livekitTokenUrl(params: LiveKitTokenParams): string {
  return `${partyOrigin()}/parties/token/${encodeURIComponent(params.room)}?${tokenQuery(params)}`;
}

export function youtubeSearchUrl(params: { q: string } | { id: string }): string {
  const query = new URLSearchParams("q" in params ? { q: params.q } : { id: params.id });
  return `${partyOrigin()}/parties/search/global?${query.toString()}`;
}

// A bundled native shell has no same-origin /api to fall back to, and a relative fetch
// there would just spend a round trip failing.
function legacyReachable(): boolean {
  return typeof window !== "undefined" && /^https?:$/.test(window.location.protocol);
}

async function fetchWithLegacyFallback(
  workerUrl: string,
  legacyUrl: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    const res = await fetch(workerUrl, init);
    if (res.status !== 403 || !legacyReachable()) return res;
    log.warn("Worker refused this origin, falling back to the Next route");
  } catch (err) {
    if (init?.signal?.aborted || !legacyReachable()) throw err;
    log.warn("Worker unreachable, falling back to the Next route:", err);
  }
  return fetch(legacyUrl, init);
}

export function fetchLiveKitToken(params: LiveKitTokenParams, init?: RequestInit): Promise<Response> {
  return fetchWithLegacyFallback(
    livekitTokenUrl(params),
    `/api/livekit-token?${tokenQuery(params)}`,
    init,
  );
}

export function fetchYouTubeSearch(
  params: { q: string } | { id: string },
  init?: RequestInit,
): Promise<Response> {
  const query = new URLSearchParams("q" in params ? { q: params.q } : { id: params.id }).toString();
  return fetchWithLegacyFallback(youtubeSearchUrl(params), `/api/youtube-search?${query}`, init);
}
