"use client";

import { useCallback, useEffect, useRef } from "react";
import { appendClockSample, buildClockSample, estimateClockOffset, type ClockSample } from "~/lib/syncMath";
import type { ClientMessage } from "~/types/room";

const JOIN_PROBES = 4;
const JOIN_PROBE_SPACING_MS = 600;
const RESAMPLE_INTERVAL_MS = 30_000;

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
  const samplesRef = useRef<ClockSample[]>([]);

  const handleTimeSync = useCallback((t0: number, t1: number) => {
    const now = Date.now();
    const sample = buildClockSample(t0, t1, now);
    if (!sample) return;

    samplesRef.current = appendClockSample(samplesRef.current, sample);
    const estimate = estimateClockOffset(samplesRef.current, now);
    if (!estimate) return;
    serverOffsetRef.current = estimate.offset;
    if (estimate.synced) clockSyncedRef.current = true;
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
