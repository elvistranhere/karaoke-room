"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ClientMessage } from "~/types/room";

const JOIN_PROBES = 4;
const JOIN_PROBE_SPACING_MS = 600;
const RESAMPLE_INTERVAL_MS = 30_000;
const MAX_SAMPLES = 8;
const BEST_SAMPLES = 4;

interface Sample {
  rtt: number;
  offset: number;
}

interface UsePartyClockReturn {
  serverOffsetRef: React.RefObject<number>;
  clockSyncedRef: React.RefObject<boolean>;
  handleTimeSync: (t0: number, t1: number) => void;
}

// Separate from the ping/pong heartbeat on purpose: the server evicts on stale pongs.
export function usePartyClock(
  sendRef: React.RefObject<((msg: ClientMessage) => void) | null>,
  isConnected: boolean,
): UsePartyClockReturn {
  const serverOffsetRef = useRef(0);
  const clockSyncedRef = useRef(false);
  const samplesRef = useRef<Sample[]>([]);

  const handleTimeSync = useCallback((t0: number, t1: number) => {
    const now = Date.now();
    const rtt = now - t0;
    if (!Number.isFinite(rtt) || rtt < 0 || rtt > 10_000) return;

    const samples = samplesRef.current;
    samples.push({ rtt, offset: t1 + rtt / 2 - now });
    if (samples.length > MAX_SAMPLES) samples.shift();

    const best = [...samples].sort((a, b) => a.rtt - b.rtt).slice(0, BEST_SAMPLES);
    const offsets = best.map((s) => s.offset).sort((a, b) => a - b);
    const mid = Math.floor(offsets.length / 2);
    const median = offsets.length % 2 === 0
      ? ((offsets[mid - 1] ?? 0) + (offsets[mid] ?? 0)) / 2
      : offsets[mid] ?? 0;
    serverOffsetRef.current = median;
    clockSyncedRef.current = true;
  }, []);

  useEffect(() => {
    if (!isConnected) {
      // The durable object may have moved, so discard stale samples on reconnect
      samplesRef.current = [];
      clockSyncedRef.current = false;
      return;
    }

    const probe = () => sendRef.current?.({ type: "time-sync", t0: Date.now() });
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < JOIN_PROBES; i++) {
      timeouts.push(setTimeout(probe, i * JOIN_PROBE_SPACING_MS));
    }
    const interval = setInterval(probe, RESAMPLE_INTERVAL_MS);

    return () => {
      for (const timeout of timeouts) clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [isConnected, sendRef]);

  return { serverOffsetRef, clockSyncedRef, handleTimeSync };
}
