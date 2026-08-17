import type { SfxTarget } from "./voiceMixer";

const TONES = [659.25, 987.77];
const TONE_GAP_SEC = 0.14;
const TONE_LENGTH_SEC = 0.34;
const TONE_PEAK = 0.06;

// Renders into the voice mixer's context, on its own bus, so the chime inherits the
// route and the gesture unlock the room already paid for and closes with the room.
// Call only from inside or after a user gesture: iOS Safari refuses to start an
// AudioContext otherwise, and a refused context stays silent for the whole session.
export function playStageChime(target: SfxTarget | null): void {
  if (!target) return;
  const { ctx, destination } = target;
  try {
    TONES.forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = frequency;
      const gain = ctx.createGain();
      const start = ctx.currentTime + index * TONE_GAP_SEC;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(TONE_PEAK, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + TONE_LENGTH_SEC);
      osc.connect(gain).connect(destination);
      osc.start(start);
      osc.stop(start + TONE_LENGTH_SEC);
    });
  } catch {
    // Web Audio unavailable, the announcement still shows
  }
}
