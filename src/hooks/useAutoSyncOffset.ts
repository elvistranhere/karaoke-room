"use client";

import { useEffect, useRef, useState } from "react";
import { SYNC_OFFSET_DEFAULT_MS } from "~/components/room/SyncOffsetControl";
import { estimateVoiceLatencyMs, roundLatencyMs, smoothLatencyMs } from "~/lib/syncMath";

const SAMPLE_MS = 5000;

interface StatFields {
  type?: string;
  kind?: string;
  jitterBufferDelay?: number;
  jitterBufferEmittedCount?: number;
  currentRoundTripTime?: number;
  nominated?: boolean;
  state?: string;
}

export type StatsProvider = () => Promise<RTCStatsReport | null>;

// Estimates how late the singer's voice reaches this listener's ears, from the
// receiver's jitter buffer hold plus half the round trip to the SFU.
export function useAutoSyncOffset(
  getStats: StatsProvider | null,
  active: boolean,
): number {
  const [autoMs, setAutoMs] = useState(SYNC_OFFSET_DEFAULT_MS);
  const prevJitterRef = useRef<{ delay: number; count: number } | null>(null);
  const emaRef = useRef<number | null>(null);

  useEffect(() => {
    // Each singer is a different track and network path, so samples never carry over
    prevJitterRef.current = null;
    emaRef.current = null;
    if (!getStats || !active) return;

    let cancelled = false;
    const sample = async () => {
      const report = await getStats();
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
      emaRef.current = smoothLatencyMs(emaRef.current, estimateVoiceLatencyMs(rttMs, jitterMs));
      const rounded = roundLatencyMs(emaRef.current);
      if (!cancelled) setAutoMs((previous) => (previous === rounded ? previous : rounded));
    };

    void sample();
    const interval = setInterval(() => void sample(), SAMPLE_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [getStats, active]);

  return autoMs;
}
