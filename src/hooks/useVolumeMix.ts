"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Participant, ParticipantStatus } from "~/types/room";
import type { VoiceMixer } from "~/lib/voiceMixer";
import { MASTER_MAX, PERSON_MAX } from "~/lib/voiceMixer";
import {
  clampGain,
  DEFAULT_PERSON_MIX,
  parseStoredVolumes,
  personMixKey,
  resolveGains,
  serializeStoredVolumes,
  trackIdentities,
  type PersonMix,
  type StoredVolumes,
} from "~/lib/volumeModel";
import type { YouTubePlayerHandle } from "./useYouTubePlayer";

const STORAGE_KEY = "karaoke:volumes";

function readStoredVolumes(): StoredVolumes {
  if (typeof window === "undefined") return parseStoredVolumes(null);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return parseStoredVolumes(raw ? JSON.parse(raw) : null);
  } catch {
    return parseStoredVolumes(null);
  }
}

function storeVolumes(value: StoredVolumes) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeStoredVolumes(value)));
  } catch {
    // storage unavailable, the mix still applies for this session
  }
}

interface UseVolumeMixParams {
  mixer: VoiceMixer;
  player: YouTubePlayerHandle;
  participants: Participant[];
  participantStatus: Record<string, ParticipantStatus>;
  micChecking: boolean;
}

interface UseVolumeMixReturn {
  master: number;
  music: number;
  people: Record<string, PersonMix>;
  deafened: boolean;
  setMaster: (value: number) => void;
  setMusic: (value: number) => void;
  setPersonVolume: (name: string, value: number) => void;
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
  micChecking,
}: UseVolumeMixParams): UseVolumeMixReturn {
  const [stored] = useState(() => readStoredVolumes());
  const [master, setMasterState] = useState(stored.master);
  const [music, setMusicState] = useState(stored.music);
  const [people, setPeople] = useState<Record<string, PersonMix>>(stored.people);
  const [deafened, setDeafenedState] = useState(false);

  const trackedRef = useRef<ReadonlyMap<string, string>>(new Map());

  // Keyed by LiveKit identity so the mixer can find the chain; the stored mix is
  // keyed by name, which survives reconnects where the identity does not.
  const gains = useMemo(() => {
    trackedRef.current = trackIdentities(
      trackedRef.current,
      participants.map((participant) => ({
        identity: participantStatus[participant.id]?.lkIdentity ?? null,
        key: personMixKey(participant),
      })),
    );
    return resolveGains({
      people,
      tracked: trackedRef.current,
      master,
      music,
      micChecking,
      deafened,
    });
  }, [participants, participantStatus, people, master, music, micChecking, deafened]);

  useEffect(() => { mixer.setPersonGains(gains.people); }, [mixer, gains.people]);
  useEffect(() => { mixer.setMaster(gains.master); }, [mixer, gains.master]);
  useEffect(() => { player.setVolume(gains.music); }, [player, gains.music]);

  useEffect(() => {
    storeVolumes({ master, music, people });
  }, [master, music, people]);

  const setMaster = useCallback((value: number) => {
    setMasterState(clampGain(value, MASTER_MAX));
  }, []);

  const setMusic = useCallback((value: number) => {
    setMusicState(clampGain(value, 1));
  }, []);

  const setPersonVolume = useCallback((name: string, value: number) => {
    setPeople((prev) => {
      const current = prev[name] ?? DEFAULT_PERSON_MIX;
      return { ...prev, [name]: { ...current, volume: clampGain(value, PERSON_MAX) } };
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

  // The rebuild the mixer may run has nothing to report back to the UI: the element
  // fallback carries the room either way, so the gesture does not wait on it.
  const resume = useCallback(() => {
    void mixer.resume();
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
