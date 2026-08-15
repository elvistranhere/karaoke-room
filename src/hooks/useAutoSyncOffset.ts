"use client";

import { useEffect, useRef, useState } from "react";
import type { Room, RemoteAudioTrack } from "livekit-client";
import { SYNC_OFFSET_DEFAULT_MS } from "~/components/room/SyncOffsetControl";
import { VOICE_TRACK_NAME } from "./useLiveKit";

const SAMPLE_MS = 5000;
// Singer-side capture and encode are not observable from the listener; the
// singer-to-SFU leg is NOT included because the server's wallTime stamp
// already carries it into the sync target.
const BASE_MS = 50;
const MIN_MS = 60;
const MAX_MS = 800;
const SMOOTHING = 0.4;

interface StatFields {
  type?: string;
  kind?: string;
  jitterBufferDelay?: number;
  jitterBufferEmittedCount?: number;
  currentRoundTripTime?: number;
  nominated?: boolean;
  state?: string;
}

// Estimates how late the singer's voice reaches this listener's ears, from the
// receiver's jitter buffer hold plus half the round trip to the SFU.
export function useAutoSyncOffset(
  room: Room | null,
  singerIdentity: string | null,
  active: boolean,
): number {
  const [autoMs, setAutoMs] = useState(SYNC_OFFSET_DEFAULT_MS);
  const prevJitterRef = useRef<{ delay: number; count: number } | null>(null);
  const emaRef = useRef<number | null>(null);

  useEffect(() => {
    // Each singer is a different track and network path, so samples never carry over
    prevJitterRef.current = null;
    emaRef.current = null;
    if (!room || !singerIdentity || !active) return;

    let cancelled = false;
    const sample = async () => {
      // lkIdentity is exact; the display-name fallback only ever matches as a
      // prefix of the real LiveKit identity (e.g. "elvis" vs "elvis-044ef3d6")
      const participant = Array.from(room.remoteParticipants.values()).find(
        (p) => p.identity === singerIdentity || p.identity.startsWith(`${singerIdentity}-`),
      );
      const publications = participant
        ? Array.from(participant.audioTrackPublications.values())
        : [];
      // The singer also has a muted managed mic; measure the real voice track
      const publication = publications.find((pub) => pub.trackName === VOICE_TRACK_NAME && pub.track)
        ?? publications.find((pub) => pub.track);
      const track = publication?.track as RemoteAudioTrack | undefined;
      if (!track?.getRTCStatsReport) return;

      let report: RTCStatsReport | undefined;
      try {
        report = await track.getRTCStatsReport();
      } catch {
        return;
      }
      if (!report || cancelled) return;

      let jitterMs = 0;
      let hasJitterDelta = false;
      let rttMs = 0;
      for (const value of report.values()) {
        const stat = value as StatFields;
        if (stat.type === "inbound-rtp" && stat.kind === "audio") {
          const delay = stat.jitterBufferDelay ?? 0;
          const count = stat.jitterBufferEmittedCount ?? 0;
          const prev = prevJitterRef.current;
          if (prev && count > prev.count) {
            jitterMs = ((delay - prev.delay) / (count - prev.count)) * 1000;
            hasJitterDelta = true;
          }
          prevJitterRef.current = { delay, count };
        }
        if (
          stat.type === "candidate-pair" &&
          stat.currentRoundTripTime !== undefined &&
          (stat.nominated || stat.state === "succeeded")
        ) {
          rttMs = Math.max(rttMs, stat.currentRoundTripTime * 1000);
        }
      }

      // The first sample only sets the jitter baseline; committing it would
      // seed the EMA with a known-too-low estimate the loop then chases
      if (!hasJitterDelta) return;
      const estimate = Math.max(MIN_MS, Math.min(MAX_MS, BASE_MS + rttMs / 2 + jitterMs));
      emaRef.current = emaRef.current === null
        ? estimate
        : emaRef.current * (1 - SMOOTHING) + estimate * SMOOTHING;
      const rounded = Math.round(emaRef.current / 10) * 10;
      if (!cancelled) setAutoMs((previous) => (previous === rounded ? previous : rounded));
    };

    void sample();
    const interval = setInterval(() => void sample(), SAMPLE_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [room, singerIdentity, active]);

  return autoMs;
}
