// Pure playback-sync math. No timers, no player, no React: everything here is a
// function of its arguments so the drift policy can be tested directly.

export const DEAD_ZONE_S = 0.05;
export const SEEK_THRESHOLD_S = 1.5;
export const NUDGE_UP = 1.05;
export const NUDGE_DOWN = 0.95;
export const RATE_TOLERANCE = 0.01;
export const PERSIST_DRIFT_S = 0.35;
export const PERSIST_DRIFT_NO_RATE_S = 0.15;
export const PERSIST_TICKS = 8;

export const MAX_RTT_MS = 2500;
export const MAX_CLOCK_SAMPLES = 8;
export const BEST_CLOCK_SAMPLES = 4;
export const MIN_SAMPLES_FOR_SYNC = 2;
export const SAMPLE_MAX_AGE_MS = 90_000;

// Singer-side capture and encode are not observable from the listener; the
// singer-to-SFU leg is NOT included because the server's wallTime stamp
// already carries it into the sync target.
export const LATENCY_BASE_MS = 50;
export const LATENCY_MIN_MS = 60;
export const LATENCY_MAX_MS = 800;
export const LATENCY_SMOOTHING = 0.4;

export type SyncAction =
  | { kind: "seek"; target: number }
  | { kind: "nudge"; rate: number }
  | { kind: "reset-rate" }
  | { kind: "none" };

export interface SyncDecision {
  action: SyncAction;
  persistTicks: number;
}

export interface ClockSample {
  rtt: number;
  offset: number;
  at: number;
}

export interface ClockEstimate {
  offset: number;
  synced: boolean;
}

// Where this client's player should be right now. Negative means the delayed timeline
// has not reached 0 yet; correcting toward 0 beats abandoning correction for the first
// offset-worth of song. Returns null when any input is unusable.
export function computeTarget(
  videoTime: number,
  wallTime: number,
  serverNow: number,
  syncOffsetMs: number,
): number | null {
  const raw = videoTime + (serverNow - wallTime) / 1000 - syncOffsetMs / 1000;
  if (!Number.isFinite(raw)) return null;
  return Math.max(0, raw);
}

// The drift policy. `persistTicks` is the running count of consecutive ticks whose
// drift stayed above the persist threshold; the caller feeds back the returned value.
export function computeSyncAction(
  target: number,
  currentTime: number,
  rateSupported: boolean,
  persistTicks: number,
): SyncDecision {
  const drift = target - currentTime;
  if (!Number.isFinite(drift)) return { action: { kind: "none" }, persistTicks: 0 };

  const magnitude = Math.abs(drift);
  if (magnitude >= SEEK_THRESHOLD_S) {
    return { action: { kind: "seek", target }, persistTicks: 0 };
  }
  if (magnitude < DEAD_ZONE_S) {
    return { action: { kind: "reset-rate" }, persistTicks: 0 };
  }

  // Nudging moves ~15ms per tick, so drift that stays large for seconds means it is not
  // working (no rate control, or a big post-ad gap): one seek instead. Without rate
  // control the seek is the only tool, so it engages sooner.
  const persistThreshold = rateSupported ? PERSIST_DRIFT_S : PERSIST_DRIFT_NO_RATE_S;
  const nextPersist = magnitude >= persistThreshold ? persistTicks + 1 : 0;
  if (nextPersist >= PERSIST_TICKS) {
    return { action: { kind: "seek", target }, persistTicks: 0 };
  }
  if (!rateSupported) return { action: { kind: "none" }, persistTicks: nextPersist };

  // YouTube quantizes rates to 0.05 steps, so only ever ask for the two endpoints:
  // a fractional request like 1.012 snaps to 1.0 and reads back as unsupported.
  return { action: { kind: "nudge", rate: drift > 0 ? NUDGE_UP : NUDGE_DOWN }, persistTicks: nextPersist };
}

// The iframe reports the applied rate a round trip later, so a requested rate that
// never showed up means the player has no rate control.
export function isRateApplied(requested: number, actual: number): boolean {
  return Math.abs(actual - requested) <= RATE_TOLERANCE;
}

// A single asymmetric round trip can hide up to rtt/2 of offset error, so slow probes
// are rejected outright rather than trusted.
export function buildClockSample(t0: number, t1: number, now: number): ClockSample | null {
  const rtt = now - t0;
  if (!Number.isFinite(rtt) || rtt < 0 || rtt > MAX_RTT_MS) return null;
  if (!Number.isFinite(t1)) return null;
  return { rtt, offset: t1 + rtt / 2 - now, at: now };
}

export function appendClockSample(samples: ClockSample[], sample: ClockSample): ClockSample[] {
  const next = [...samples, sample];
  return next.length > MAX_CLOCK_SAMPLES ? next.slice(next.length - MAX_CLOCK_SAMPLES) : next;
}

// Median offset of the lowest-RTT samples. Old samples predate any local clock step
// (NTP correction, sleep), so fresh ones win even when their round trips are worse.
export function estimateClockOffset(samples: ClockSample[], now: number): ClockEstimate | null {
  const fresh = samples.filter((sample) => now - sample.at <= SAMPLE_MAX_AGE_MS);
  const pool = fresh.length > 0 ? fresh : samples;
  if (pool.length === 0) return null;

  const best = [...pool].sort((a, b) => a.rtt - b.rtt).slice(0, BEST_CLOCK_SAMPLES);
  const offsets = best.map((sample) => sample.offset).sort((a, b) => a - b);
  const mid = Math.floor(offsets.length / 2);
  const median = offsets.length % 2 === 0
    ? ((offsets[mid - 1] ?? 0) + (offsets[mid] ?? 0)) / 2
    : offsets[mid] ?? 0;

  return { offset: median, synced: pool.length >= MIN_SAMPLES_FOR_SYNC };
}

// How late the singer's voice reaches this listener: the receiver's jitter buffer hold
// plus half the round trip to the SFU.
export function estimateVoiceLatencyMs(rttMs: number, jitterMs: number): number {
  const raw = LATENCY_BASE_MS + rttMs / 2 + jitterMs;
  // NaN would survive the clamp and poison the EMA for the rest of the session
  if (Number.isNaN(raw)) return LATENCY_MIN_MS;
  return Math.max(LATENCY_MIN_MS, Math.min(LATENCY_MAX_MS, raw));
}

export function smoothLatencyMs(previous: number | null, estimate: number): number {
  if (previous === null || !Number.isFinite(previous)) return estimate;
  return previous * (1 - LATENCY_SMOOTHING) + estimate * LATENCY_SMOOTHING;
}

export function roundLatencyMs(value: number): number {
  return Math.round(value / 10) * 10;
}
