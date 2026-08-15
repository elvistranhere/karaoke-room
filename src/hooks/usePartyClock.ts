"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ClientMessage } from "~/types/room";

const JOIN_PROBES = 4;
const JOIN_PROBE_SPACING_MS = 600;
const RESAMPLE_INTERVAL_MS = 30_000;
const MAX_SAMPLES = 8;
const BEST_SAMPLES = 4;

const MAX_RTT_MS = 2500;
const MIN_SAMPLES_FOR_SYNC = 2;
const SAMPLE_MAX_AGE_MS = 90_000;

interface Sample {
  rtt: number;
  offset: number;
  at: number;
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
    // A single asymmetric round trip can hide up to rtt/2 of offset error, so
    // slow probes are rejected outright rather than trusted
    if (!Number.isFinite(rtt) || rtt < 0 || rtt > MAX_RTT_MS) return;

    const samples = samplesRef.current;
    samples.push({ rtt, offset: t1 + rtt / 2 - now, at: now });
    if (samples.length > MAX_SAMPLES) samples.shift();

    // Old samples predate any local clock step (NTP correction, sleep), so
    // prefer fresh ones even when their round trips are worse
    const fresh = samples.filter((s) => now - s.at <= SAMPLE_MAX_AGE_MS);
    const pool = fresh.length > 0 ? fresh : samples;
    const best = [...pool].sort((a, b) => a.rtt - b.rtt).slice(0, BEST_SAMPLES);
    const offsets = best.map((s) => s.offset).sort((a, b) => a - b);
    const mid = Math.floor(offsets.length / 2);
    const median = offsets.length % 2 === 0
      ? ((offsets[mid - 1] ?? 0) + (offsets[mid] ?? 0)) / 2
      : offsets[mid] ?? 0;
    serverOffsetRef.current = median;
    if (pool.length >= MIN_SAMPLES_FOR_SYNC) clockSyncedRef.current = true;
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
