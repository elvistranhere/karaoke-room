/**
 * navigator.audioSession type switching, iOS only in practice: no other engine
 * implements it, and the feature detect makes every other platform a no-op.
 *
 * Binding rule from the research: "playback" pins a category that cannot record,
 * so it may only be set once every capture owner has released. Owners are keyed
 * rather than counted, so a double begin or a double end cannot strand the state.
 */

// "probe" is the label-permission getUserMedia in useAudioDevices: short-lived,
// but a real capture, so it has to hold the session like any other.
export type CaptureOwner = "singing" | "mic" | "mic-check" | "probe";

type AudioSessionType = "playback" | "play-and-record";

interface AudioSessionLike {
  type: string;
}

const owners = new Set<CaptureOwner>();

function getAudioSession(): AudioSessionLike | null {
  if (typeof navigator === "undefined") return null;
  const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
  return session && typeof session === "object" ? session : null;
}

function setSessionType(type: AudioSessionType): void {
  const session = getAudioSession();
  if (!session) return;
  try {
    session.type = type;
  } catch {
    // the type is unsupported on this engine, the default session still plays
  }
}

export function beginAudioCapture(owner: CaptureOwner): void {
  const wasIdle = owners.size === 0;
  owners.add(owner);
  if (wasIdle) setSessionType("play-and-record");
}

export function endAudioCapture(owner: CaptureOwner): void {
  if (!owners.delete(owner)) return;
  if (owners.size === 0) setSessionType("playback");
}

export function resetAudioSession(): void {
  owners.clear();
  setSessionType("playback");
}
