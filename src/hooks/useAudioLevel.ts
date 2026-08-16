"use client";

import { useEffect, useState } from "react";

const POLL_MS = 75;
const SMOOTHING = 0.45;

// Smoothed 0..1 meter level from any level source. Polling beats an event stream here:
// the meters redraw at a fixed rate whatever the transport reports.
export function useAudioLevel(getLevel: (() => number) | null, active: boolean): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!getLevel || !active) {
      setLevel(0);
      return;
    }

    const update = () => {
      const live = Math.min(1, Math.max(0, getLevel() || 0));
      setLevel((previous) => previous * (1 - SMOOTHING) + live * SMOOTHING);
    };
    update();
    const interval = window.setInterval(update, POLL_MS);
    return () => window.clearInterval(interval);
  }, [getLevel, active]);

  return level;
}
