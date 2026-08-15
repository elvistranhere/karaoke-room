"use client";

import { useEffect, useRef, useState } from "react";
import type { Room, RemoteAudioTrack } from "livekit-client";
import { SYNC_OFFSET_DEFAULT_MS } from "~/components/room/SyncOffsetControl";

const SAMPLE_MS = 5000;
// Singer-side capture, encode, and singer-to-SFU transit are not observable from
// the listener, so a fixed base stands in for them.
const BASE_MS = 80;
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
    if (!room || !singerIdentity || !active) {
      prevJitterRef.current = null;
      emaRef.current = null;
      return;
    }

    let cancelled = false;
    const sample = async () => {
      const participant = Array.from(room.remoteParticipants.values()).find(
        (p) => p.identity === singerIdentity,
      );
      const publication = participant
        ? Array.from(participant.audioTrackPublications.values()).find((pub) => pub.track)
        : undefined;
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
      let rttMs = 0;
      for (const value of report.values()) {
        const stat = value as StatFields;
        if (stat.type === "inbound-rtp" && stat.kind === "audio") {
          const delay = stat.jitterBufferDelay ?? 0;
          const count = stat.jitterBufferEmittedCount ?? 0;
          const prev = prevJitterRef.current;
          if (prev && count > prev.count) {
            jitterMs = ((delay - prev.delay) / (count - prev.count)) * 1000;
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
