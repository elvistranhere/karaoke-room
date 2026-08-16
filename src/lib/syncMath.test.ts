import { describe, expect, it } from "vitest";
import {
  appendClockSample,
  buildClockSample,
  computeSyncAction,
  computeTarget,
  estimateClockOffset,
  estimateVoiceLatencyMs,
  isRateApplied,
  roundLatencyMs,
  smoothLatencyMs,
  BEST_CLOCK_SAMPLES,
  DEAD_ZONE_S,
  LATENCY_MAX_MS,
  LATENCY_MIN_MS,
  MAX_CLOCK_SAMPLES,
  MAX_RTT_MS,
  NUDGE_DOWN,
  NUDGE_UP,
  PERSIST_TICKS,
  SAMPLE_MAX_AGE_MS,
  SEEK_THRESHOLD_S,
  type ClockSample,
} from "~/lib/syncMath";

describe("computeTarget", () => {
  it("adds the elapsed wall time since the singer's stamp", () => {
    expect(computeTarget(10, 1_000, 3_000, 0)).toBe(12);
  });

  it("subtracts the listener's sync offset", () => {
    expect(computeTarget(10, 1_000, 1_000, 250)).toBeCloseTo(9.75, 10);
  });

  it("clamps a negative target to zero rather than giving up on correction", () => {
    expect(computeTarget(0, 1_000, 1_000, 800)).toBe(0);
    expect(computeTarget(0.1, 5_000, 1_000, 0)).toBe(0);
  });

  it("returns null for non-finite inputs", () => {
    expect(computeTarget(Number.NaN, 1_000, 1_000, 0)).toBeNull();
    expect(computeTarget(10, Number.NaN, 1_000, 0)).toBeNull();
    expect(computeTarget(10, 1_000, Number.POSITIVE_INFINITY, 0)).toBeNull();
    expect(computeTarget(10, 1_000, 1_000, Number.NaN)).toBeNull();
  });
});

describe("computeSyncAction", () => {
  it("does nothing inside the dead zone beyond resetting the rate", () => {
    const decision = computeSyncAction(10, 10 + DEAD_ZONE_S / 2, true, 3);
    expect(decision.action).toEqual({ kind: "reset-rate" });
    expect(decision.persistTicks).toBe(0);
  });

  it("seeks immediately past the seek threshold, ahead or behind", () => {
    expect(computeSyncAction(20, 10, true, 0).action).toEqual({ kind: "seek", target: 20 });
    expect(computeSyncAction(10, 20, true, 0).action).toEqual({ kind: "seek", target: 10 });
  });

  it("clears the persist count on a threshold seek", () => {
    expect(computeSyncAction(10, 10 + SEEK_THRESHOLD_S, true, 5).persistTicks).toBe(0);
  });

  it("nudges up when behind and down when ahead", () => {
    expect(computeSyncAction(10.2, 10, true, 0).action).toEqual({ kind: "nudge", rate: NUDGE_UP });
    expect(computeSyncAction(10, 10.2, true, 0).action).toEqual({ kind: "nudge", rate: NUDGE_DOWN });
  });

  it("treats the dead zone edge as correctable and the seek edge as a seek", () => {
    expect(computeSyncAction(10 + DEAD_ZONE_S, 10, true, 0).action.kind).toBe("nudge");
    expect(computeSyncAction(10 + SEEK_THRESHOLD_S, 10, true, 0).action.kind).toBe("seek");
  });

  it("only counts persist ticks while drift stays above the rate-supported threshold", () => {
    // 0.2s of drift nudges but never accumulates, so it can never trip the persist seek
    let persist = 0;
    for (let tick = 0; tick < PERSIST_TICKS * 2; tick++) {
      const decision = computeSyncAction(10.2, 10, true, persist);
      persist = decision.persistTicks;
      expect(decision.action.kind).toBe("nudge");
    }
    expect(persist).toBe(0);
  });

  it("escalates to a seek after PERSIST_TICKS of large-but-nudgeable drift", () => {
    let persist = 0;
    for (let tick = 0; tick < PERSIST_TICKS - 1; tick++) {
      const decision = computeSyncAction(10.5, 10, true, persist);
      expect(decision.action).toEqual({ kind: "nudge", rate: NUDGE_UP });
      persist = decision.persistTicks;
    }
    expect(persist).toBe(PERSIST_TICKS - 1);
    const final = computeSyncAction(10.5, 10, true, persist);
    expect(final.action).toEqual({ kind: "seek", target: 10.5 });
    expect(final.persistTicks).toBe(0);
  });

  it("resets the persist count when drift falls back under the threshold", () => {
    const built = computeSyncAction(10.5, 10, true, 5);
    expect(built.persistTicks).toBe(6);
    expect(computeSyncAction(10.2, 10, true, 6).persistTicks).toBe(0);
  });

  it("engages the persist seek sooner without rate support", () => {
    // 0.2s clears the no-rate threshold (0.15s) but not the rate-supported one (0.35s)
    let persist = 0;
    for (let tick = 0; tick < PERSIST_TICKS - 1; tick++) {
      const decision = computeSyncAction(10.2, 10, false, persist);
      expect(decision.action).toEqual({ kind: "none" });
      persist = decision.persistTicks;
    }
    expect(computeSyncAction(10.2, 10, false, persist).action).toEqual({ kind: "seek", target: 10.2 });
    expect(computeSyncAction(10.2, 10, true, persist).action).toEqual({ kind: "nudge", rate: NUDGE_UP });
  });

  it("never nudges without rate support", () => {
    expect(computeSyncAction(10.5, 10, false, 0).action).toEqual({ kind: "none" });
    expect(computeSyncAction(10.1, 10, false, 0).action).toEqual({ kind: "none" });
  });

  it("returns none on non-finite inputs instead of seeking to NaN", () => {
    expect(computeSyncAction(Number.NaN, 10, true, 4)).toEqual({ action: { kind: "none" }, persistTicks: 0 });
    expect(computeSyncAction(10, Number.NaN, true, 4)).toEqual({ action: { kind: "none" }, persistTicks: 0 });
    expect(computeSyncAction(Number.POSITIVE_INFINITY, 10, true, 0).action).toEqual({ kind: "none" });
  });

  it("treats a zero target as a real target, not a missing one", () => {
    expect(computeSyncAction(0, 5, true, 0).action).toEqual({ kind: "seek", target: 0 });
  });
});

describe("isRateApplied", () => {
  it("accepts the quantized rate the iframe reports back", () => {
    expect(isRateApplied(1.05, 1.05)).toBe(true);
    expect(isRateApplied(1.05, 1.0500001)).toBe(true);
  });

  it("rejects a player that snapped the request back to 1", () => {
    expect(isRateApplied(1.05, 1)).toBe(false);
    expect(isRateApplied(0.95, 1)).toBe(false);
  });
});

describe("buildClockSample", () => {
  it("halves the round trip into the offset", () => {
    // t0=1000, now=1100 -> rtt 100; the server said 5050 at its midpoint
    expect(buildClockSample(1_000, 5_050, 1_100)).toEqual({ rtt: 100, offset: 4_000, at: 1_100 });
  });

  it("rejects round trips that are too slow to trust", () => {
    expect(buildClockSample(0, 5_000, MAX_RTT_MS + 1)).toBeNull();
    expect(buildClockSample(0, 5_000, MAX_RTT_MS)).not.toBeNull();
  });

  it("rejects a negative round trip from a stepped local clock", () => {
    expect(buildClockSample(2_000, 5_000, 1_000)).toBeNull();
  });

  it("rejects non-finite stamps", () => {
    expect(buildClockSample(Number.NaN, 5_000, 1_000)).toBeNull();
    expect(buildClockSample(1_000, Number.NaN, 1_100)).toBeNull();
  });
});

describe("appendClockSample", () => {
  const sample = (at: number): ClockSample => ({ rtt: 10, offset: 0, at });

  it("keeps only the newest MAX_CLOCK_SAMPLES", () => {
    let samples: ClockSample[] = [];
    for (let i = 0; i < MAX_CLOCK_SAMPLES + 3; i++) samples = appendClockSample(samples, sample(i));
    expect(samples).toHaveLength(MAX_CLOCK_SAMPLES);
    expect(samples[0]?.at).toBe(3);
    expect(samples.at(-1)?.at).toBe(MAX_CLOCK_SAMPLES + 2);
  });

  it("does not mutate the input", () => {
    const samples = [sample(1)];
    expect(appendClockSample(samples, sample(2))).toHaveLength(2);
    expect(samples).toHaveLength(1);
  });
});

describe("estimateClockOffset", () => {
  const now = 100_000;

  it("returns null with no samples", () => {
    expect(estimateClockOffset([], now)).toBeNull();
  });

  it("does not report synced off a single sample", () => {
    const estimate = estimateClockOffset([{ rtt: 10, offset: 500, at: now }], now);
    expect(estimate).toEqual({ offset: 500, synced: false });
  });

  it("takes the median of the lowest-RTT samples", () => {
    const samples: ClockSample[] = [
      { rtt: 10, offset: 100, at: now },
      { rtt: 20, offset: 140, at: now },
      { rtt: 30, offset: 180, at: now },
      { rtt: 900, offset: 9_000, at: now },
      { rtt: 950, offset: 9_500, at: now },
    ];
    // best 4 by rtt -> offsets 100, 140, 180, 9000 -> median of the middle pair
    expect(estimateClockOffset(samples, now)).toEqual({ offset: 160, synced: true });
  });

  it("averages the middle pair on an even pool and takes the middle on an odd one", () => {
    const even: ClockSample[] = [
      { rtt: 1, offset: 0, at: now },
      { rtt: 2, offset: 10, at: now },
    ];
    expect(estimateClockOffset(even, now)?.offset).toBe(5);

    const odd: ClockSample[] = [
      { rtt: 1, offset: 0, at: now },
      { rtt: 2, offset: 10, at: now },
      { rtt: 3, offset: 100, at: now },
    ];
    expect(estimateClockOffset(odd, now)?.offset).toBe(10);
  });

  it("ignores stale samples when fresh ones exist, even if the stale ones are faster", () => {
    const samples: ClockSample[] = [
      { rtt: 1, offset: -5_000, at: now - SAMPLE_MAX_AGE_MS - 1 },
      { rtt: 2, offset: -5_000, at: now - SAMPLE_MAX_AGE_MS - 1 },
      { rtt: 400, offset: 200, at: now },
    ];
    expect(estimateClockOffset(samples, now)).toEqual({ offset: 200, synced: false });
  });

  it("falls back to stale samples when nothing fresh is left", () => {
    const samples: ClockSample[] = [
      { rtt: 10, offset: 400, at: now - SAMPLE_MAX_AGE_MS - 1 },
      { rtt: 20, offset: 600, at: now - SAMPLE_MAX_AGE_MS - 5 },
    ];
    expect(estimateClockOffset(samples, now)).toEqual({ offset: 500, synced: true });
  });

  it("counts a sample exactly at the age limit as fresh", () => {
    const samples: ClockSample[] = [{ rtt: 10, offset: 42, at: now - SAMPLE_MAX_AGE_MS }];
    expect(estimateClockOffset(samples, now)?.offset).toBe(42);
  });

  it("never widens the pool past BEST_CLOCK_SAMPLES", () => {
    const samples: ClockSample[] = Array.from({ length: MAX_CLOCK_SAMPLES }, (_, i) => ({
      rtt: i + 1,
      offset: i === 0 ? 0 : 1_000,
      at: now,
    }));
    // the four fastest are offsets 0, 1000, 1000, 1000 -> median 1000
    expect(BEST_CLOCK_SAMPLES).toBe(4);
    expect(estimateClockOffset(samples, now)?.offset).toBe(1_000);
  });

  it("does not reorder the caller's array", () => {
    const samples: ClockSample[] = [
      { rtt: 90, offset: 1, at: now },
      { rtt: 10, offset: 2, at: now },
    ];
    estimateClockOffset(samples, now);
    expect(samples[0]?.rtt).toBe(90);
  });
});

describe("voice latency estimation", () => {
  it("adds half the round trip and the jitter hold to the base", () => {
    expect(estimateVoiceLatencyMs(200, 50)).toBe(200);
  });

  it("clamps to the usable range", () => {
    expect(estimateVoiceLatencyMs(0, 0)).toBe(LATENCY_MIN_MS);
    expect(estimateVoiceLatencyMs(10_000, 10_000)).toBe(LATENCY_MAX_MS);
    expect(estimateVoiceLatencyMs(-1_000, -1_000)).toBe(LATENCY_MIN_MS);
  });

  it("falls back to the floor on NaN stats and clamps infinities", () => {
    expect(estimateVoiceLatencyMs(Number.NaN, 40)).toBe(LATENCY_MIN_MS);
    expect(estimateVoiceLatencyMs(100, Number.NaN)).toBe(LATENCY_MIN_MS);
    expect(estimateVoiceLatencyMs(100, Number.POSITIVE_INFINITY)).toBe(LATENCY_MAX_MS);
    expect(estimateVoiceLatencyMs(Number.NEGATIVE_INFINITY, 0)).toBe(LATENCY_MIN_MS);
  });

  it("seeds the EMA with the first estimate and then converges", () => {
    expect(smoothLatencyMs(null, 300)).toBe(300);
    expect(smoothLatencyMs(Number.NaN, 300)).toBe(300);
    expect(smoothLatencyMs(100, 200)).toBeCloseTo(140, 10);
    let ema = smoothLatencyMs(null, 100);
    for (let i = 0; i < 30; i++) ema = smoothLatencyMs(ema, 300);
    expect(ema).toBeCloseTo(300, 3);
  });

  it("rounds to the nearest 10ms so the slider does not jitter", () => {
    expect(roundLatencyMs(143)).toBe(140);
    expect(roundLatencyMs(145)).toBe(150);
    expect(roundLatencyMs(0)).toBe(0);
  });
});
