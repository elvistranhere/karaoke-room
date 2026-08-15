"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Participant, ParticipantStatus } from "~/types/room";
import type { VoiceMixer } from "~/lib/voiceMixer";
import { MASTER_MAX, PERSON_MAX } from "~/lib/voiceMixer";
import type { YouTubePlayerHandle } from "./useYouTubePlayer";

export interface PersonMix {
  talk: number;
  stage: number;
  muted: boolean;
}

export type PersonMixKey = "talk" | "stage";

export const DEFAULT_PERSON_MIX: PersonMix = { talk: 1, stage: 1, muted: false };

const STORAGE_KEY = "karaoke:volumes";
const DEFAULT_MASTER = 1;
const DEFAULT_MUSIC = 0.7;
const MAX_STORED_PEOPLE = 50;
const MAX_TRACKED_IDENTITIES = 200;
const ANON_KEY_PREFIX = "peer:";

// The server allows unlimited duplicate "Anonymous" participants, so those get a
// per-peer key instead of the shared name and are never persisted.
export function personMixKey(participant: { id: string; name: string }): string {
  return participant.name.trim().toLowerCase() === "anonymous"
    ? `${ANON_KEY_PREFIX}${participant.id}`
    : participant.name;
}

interface StoredVolumes {
  master: number;
  music: number;
  people: Record<string, PersonMix>;
}

// Non-finite falls back to unity, matching clampGain in voiceMixer: a corrupt stored
// value must never silence someone.
function clamp(value: number, max: number): number {
  if (!Number.isFinite(value)) return Math.min(1, max);
  return Math.max(0, Math.min(max, value));
}

function readStoredVolumes(): StoredVolumes {
  const fallback: StoredVolumes = { master: DEFAULT_MASTER, music: DEFAULT_MUSIC, people: {} };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return fallback;
    const blob = parsed as Partial<StoredVolumes>;
    const people: Record<string, PersonMix> = {};
    if (blob.people && typeof blob.people === "object") {
      for (const [name, mix] of Object.entries(blob.people)) {
        if (!mix || typeof mix !== "object") continue;
        // Shared-name keys written before per-peer anonymous keys existed
        if (name.trim().toLowerCase() === "anonymous" || name.startsWith(ANON_KEY_PREFIX)) continue;
        people[name] = {
          talk: clamp(Number(mix.talk ?? 1), PERSON_MAX),
          stage: clamp(Number(mix.stage ?? 1), PERSON_MAX),
          muted: mix.muted === true,
        };
      }
    }
    return {
      master: Number.isFinite(blob.master) ? clamp(Number(blob.master), MASTER_MAX) : DEFAULT_MASTER,
      music: Number.isFinite(blob.music) ? clamp(Number(blob.music), 1) : DEFAULT_MUSIC,
      people,
    };
  } catch {
    return fallback;
  }
}

function storeVolumes(value: StoredVolumes) {
  if (typeof window === "undefined") return;
  try {
    const entries = Object.entries(value.people).filter(([name]) => !name.startsWith(ANON_KEY_PREFIX));
    const people = Object.fromEntries(
      entries.length > MAX_STORED_PEOPLE ? entries.slice(entries.length - MAX_STORED_PEOPLE) : entries
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...value, people }));
  } catch {
    // storage unavailable, the mix still applies for this session
  }
}

interface UseVolumeMixParams {
  mixer: VoiceMixer;
  player: YouTubePlayerHandle;
  participants: Participant[];
  participantStatus: Record<string, ParticipantStatus>;
  currentSingerId: string | null;
  micChecking: boolean;
}

interface UseVolumeMixReturn {
  master: number;
  music: number;
  people: Record<string, PersonMix>;
  deafened: boolean;
  setMaster: (value: number) => void;
  setMusic: (value: number) => void;
  setPersonVolume: (name: string, key: PersonMixKey, value: number) => void;
  togglePersonMute: (name: string) => void;
  setDeafened: (value: boolean) => void;
  resetPeople: () => void;
  resume: () => void;
}

export function useVolumeMix({
  mixer,
  player,
  participants,
  participantStatus,
  currentSingerId,
  micChecking,
}: UseVolumeMixParams): UseVolumeMixReturn {
  const [stored] = useState(() => readStoredVolumes());
  const [master, setMasterState] = useState(stored.master);
  const [music, setMusicState] = useState(stored.music);
  const [people, setPeople] = useState<Record<string, PersonMix>>(stored.people);
  const [deafened, setDeafenedState] = useState(false);

  const effectiveMaster = deafened ? 0 : master;
  const musicVolume = deafened || micChecking ? 0 : music * Math.min(master, 1) * 100;

  // Identities stay in the map after their owner drops off the PartyKit roster: their
  // LiveKit track can outlive the WebSocket, and an unmatched chain resets to full gain.
  const trackedRef = useRef<Map<string, { peerId: string; key: string }>>(new Map());

  // Keyed by LiveKit identity so the mixer can find the chain; the stored mix is
  // keyed by name, which survives reconnects where the identity does not.
  const personGains = useMemo(() => {
    const tracked = trackedRef.current;
    for (const participant of participants) {
      const key = personMixKey(participant);
      const lkIdentity = participantStatus[participant.id]?.lkIdentity;
      // The name fallback is ambiguous for duplicate "Anonymous", so those wait for a real identity
      if (!lkIdentity && key.startsWith(ANON_KEY_PREFIX)) continue;
      const identity = lkIdentity ?? participant.name;
      tracked.delete(identity);
      tracked.set(identity, { peerId: participant.id, key });
    }
    while (tracked.size > MAX_TRACKED_IDENTITIES) {
      const oldest = tracked.keys().next().value;
      if (oldest === undefined) break;
      tracked.delete(oldest);
    }

    const gains: Record<string, number> = {};
    // Name keys let a stored mix apply through the mixer's "name-suffix" fallback in the
    // window between the LiveKit subscription and the first PartyKit state message.
    for (const [key, mix] of Object.entries(people)) {
      if (!key.startsWith(ANON_KEY_PREFIX)) gains[key] = mix.muted ? 0 : mix.talk;
    }
    for (const [identity, entry] of tracked) {
      const mix = people[entry.key] ?? DEFAULT_PERSON_MIX;
      gains[identity] = mix.muted ? 0 : entry.peerId === currentSingerId ? mix.stage : mix.talk;
    }
    return gains;
  }, [participants, participantStatus, people, currentSingerId]);

  useEffect(() => { mixer.setPersonGains(personGains); }, [mixer, personGains]);
  useEffect(() => { mixer.setMaster(effectiveMaster); }, [mixer, effectiveMaster]);
  useEffect(() => { player.setVolume(musicVolume); }, [player, musicVolume]);

  useEffect(() => {
    storeVolumes({ master, music, people });
  }, [master, music, people]);

  const setMaster = useCallback((value: number) => {
    setMasterState(clamp(value, MASTER_MAX));
  }, []);

  const setMusic = useCallback((value: number) => {
    setMusicState(clamp(value, 1));
  }, []);

  const setPersonVolume = useCallback((name: string, key: PersonMixKey, value: number) => {
    setPeople((prev) => {
      const current = prev[name] ?? DEFAULT_PERSON_MIX;
      return { ...prev, [name]: { ...current, [key]: clamp(value, PERSON_MAX) } };
    });
  }, []);

  const togglePersonMute = useCallback((name: string) => {
    setPeople((prev) => {
      const current = prev[name] ?? DEFAULT_PERSON_MIX;
      return { ...prev, [name]: { ...current, muted: !current.muted } };
    });
  }, []);

  const resetPeople = useCallback(() => {
    setPeople({});
  }, []);

  const setDeafened = useCallback((value: boolean) => {
    setDeafenedState(value);
  }, []);

  const resume = useCallback(() => {
    mixer.resume();
  }, [mixer]);

  return {
    master,
    music,
    people,
    deafened,
    setMaster,
    setMusic,
    setPersonVolume,
    togglePersonMute,
    setDeafened,
    resetPeople,
    resume,
  };
}
