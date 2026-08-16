import { MASTER_MAX, PERSON_MAX } from "./voiceMixer";

// Pure volume model. useVolumeMix owns the React state and pushes the result into the
// mixer and the player; every decision about what a gain should be is made here.

export interface PersonMix {
  talk: number;
  stage: number;
  muted: boolean;
}

export type PersonMixKey = "talk" | "stage";

export const DEFAULT_PERSON_MIX: PersonMix = { talk: 1, stage: 1, muted: false };

export const ANON_KEY_PREFIX = "peer:";
export const DEFAULT_MASTER = 1;
export const DEFAULT_MUSIC = 0.7;
export const MAX_STORED_PEOPLE = 50;
export const MAX_TRACKED_IDENTITIES = 200;

export interface StoredVolumes {
  master: number;
  music: number;
  people: Record<string, PersonMix>;
}

export interface TrackedPerson {
  peerId: string;
  key: string;
}

export interface ResolveGainsInput {
  people: Record<string, PersonMix>;
  // LiveKit identity -> tracked person, in least-recently-seen order
  tracked: ReadonlyMap<string, TrackedPerson>;
  master: number;
  music: number;
  currentSingerId: string | null;
  micChecking: boolean;
  deafened: boolean;
}

export interface ResolvedGains {
  people: Record<string, number>;
  master: number;
  music: number;
}

// The server allows unlimited duplicate "Anonymous" participants, so those get a
// per-peer key instead of the shared name and are never persisted.
export function personMixKey(participant: { id: string; name: string }): string {
  return participant.name.trim().toLowerCase() === "anonymous"
    ? `${ANON_KEY_PREFIX}${participant.id}`
    : participant.name;
}

// Non-finite falls back to unity, matching clampGain in voiceMixer: a corrupt stored
// value must never silence someone.
export function clampGain(value: number, max: number): number {
  if (!Number.isFinite(value)) return Math.min(1, max);
  return Math.max(0, Math.min(max, value));
}

export function parseStoredVolumes(parsed: unknown): StoredVolumes {
  const fallback: StoredVolumes = { master: DEFAULT_MASTER, music: DEFAULT_MUSIC, people: {} };
  if (!parsed || typeof parsed !== "object") return fallback;

  const blob = parsed as Partial<StoredVolumes>;
  const people: Record<string, PersonMix> = {};
  if (blob.people && typeof blob.people === "object") {
    for (const [name, mix] of Object.entries(blob.people)) {
      if (!mix || typeof mix !== "object") continue;
      // Shared-name keys written before per-peer anonymous keys existed
      if (name.trim().toLowerCase() === "anonymous" || name.startsWith(ANON_KEY_PREFIX)) continue;
      people[name] = {
        talk: clampGain(Number(mix.talk ?? 1), PERSON_MAX),
        stage: clampGain(Number(mix.stage ?? 1), PERSON_MAX),
        muted: mix.muted === true,
      };
    }
  }

  return {
    master: Number.isFinite(blob.master) ? clampGain(Number(blob.master), MASTER_MAX) : DEFAULT_MASTER,
    music: Number.isFinite(blob.music) ? clampGain(Number(blob.music), 1) : DEFAULT_MUSIC,
    people,
  };
}

export function serializeStoredVolumes(value: StoredVolumes): StoredVolumes {
  const entries = Object.entries(value.people).filter(([name]) => !name.startsWith(ANON_KEY_PREFIX));
  const people = Object.fromEntries(
    entries.length > MAX_STORED_PEOPLE ? entries.slice(entries.length - MAX_STORED_PEOPLE) : entries,
  );
  return { ...value, people };
}

// Identities stay in the map after their owner drops off the PartyKit roster: their
// LiveKit track can outlive the WebSocket, and an unmatched chain resets to full gain.
export function trackIdentities(
  previous: ReadonlyMap<string, TrackedPerson>,
  roster: { identity: string | null; peerId: string; key: string }[],
): Map<string, TrackedPerson> {
  const tracked = new Map(previous);
  for (const { identity, peerId, key } of roster) {
    // The name fallback is ambiguous for duplicate "Anonymous", so those wait for a real identity
    if (!identity && key.startsWith(ANON_KEY_PREFIX)) continue;
    const resolved = identity ?? key;
    tracked.delete(resolved);
    tracked.set(resolved, { peerId, key });
  }
  while (tracked.size > MAX_TRACKED_IDENTITIES) {
    const oldest = tracked.keys().next().value;
    if (oldest === undefined) break;
    tracked.delete(oldest);
  }
  return tracked;
}

export function resolveGains({
  people,
  tracked,
  master,
  music,
  currentSingerId,
  micChecking,
  deafened,
}: ResolveGainsInput): ResolvedGains {
  const gains: Record<string, number> = {};

  // Name keys let a stored mix apply through the mixer's "name-suffix" fallback in the
  // window between the LiveKit subscription and the first PartyKit state message.
  for (const [key, mix] of Object.entries(people)) {
    if (!key.startsWith(ANON_KEY_PREFIX)) gains[key] = mix.muted ? 0 : clampGain(mix.talk, PERSON_MAX);
  }
  // Matched on peerId, not on the mix key: a retained identity from an earlier session
  // shares the singer's key and must stay on talk gain.
  for (const [identity, entry] of tracked) {
    const mix = people[entry.key] ?? DEFAULT_PERSON_MIX;
    const value = entry.peerId === currentSingerId ? mix.stage : mix.talk;
    gains[identity] = mix.muted ? 0 : clampGain(value, PERSON_MAX);
  }

  return {
    people: gains,
    master: deafened ? 0 : clampGain(master, MASTER_MAX),
    // YouTube's own volume scale is 0-100 and it caps there, so the master only ever
    // attenuates the music bus
    music: deafened || micChecking ? 0 : clampGain(music, 1) * Math.min(clampGain(master, MASTER_MAX), 1) * 100,
  };
}
