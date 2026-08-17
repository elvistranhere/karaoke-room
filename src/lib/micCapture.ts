/**
 * Capture-swap primitives shared by every path that changes a live microphone.
 *
 * Binding rule from the research: iOS holds one capture unit per device, and a second
 * getUserMedia for the same media type permanently mutes the track the first one owns.
 * So a swap either happens inside the existing track (best), or releases before it
 * acquires (correct, with a gap), and only ever acquires first where overlapping
 * captures are safe.
 */

import { isIOSDevice } from "./audioRoutes";

// iOS only in practice. Everywhere else two captures can overlap, which buys a gapless
// swap, so the ordering stays where it is rather than costing every user the gap.
export function capturesAreExclusive(): boolean {
  return isIOSDevice();
}

export function isStreamLive(stream: MediaStream | null): boolean {
  return stream?.getAudioTracks().some((t) => t.readyState === "live") ?? false;
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/**
 * Change noise cancellation on the track that is already open, which is the only swap
 * that costs nothing: no second capture, no Bluetooth route flip, no gap.
 *
 * Returns false when the engine could not prove it applied, and the caller falls back
 * to a full re-capture. A resolved applyConstraints is not proof on its own: WebKit
 * resolves it having ignored the processing constraints, and reporting success there
 * would silently turn the user's noise-cancellation toggle into a no-op.
 */
export async function applyNoiseCancellationInPlace(
  stream: MediaStream | null,
  nc: boolean,
): Promise<boolean> {
  const track = stream?.getAudioTracks()[0];
  if (!track) return false;
  if (track.readyState !== "live") return false;
  try {
    await track.applyConstraints({ echoCancellation: nc, noiseSuppression: nc, autoGainControl: nc });
  } catch {
    return false;
  }
  const settings = track.getSettings();
  return settings.echoCancellation === nc
    && settings.noiseSuppression === nc
    && settings.autoGainControl === nc;
}
