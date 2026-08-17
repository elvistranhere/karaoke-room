import type { MicMode } from "~/hooks/useAudioDevices";

/**
 * The one place that decides what a capture looks like.
 *
 * Platform-free by construction: a driver translates a profile into whatever its
 * platform can express (MediaTrackConstraints on web, AVAudioSession settings on iOS)
 * and never re-decides any of these five values.
 */
export interface CaptureProfile {
  // Echo cancellation, noise suppression and auto gain move together; there is no
  // path that wants one of them without the other two.
  nc: boolean;
  channels: 1 | 2;
  sampleRateHz: 48000 | null;
  preset: "voice" | "musicStereo" | "musicHQ";
  dtx: boolean;
}

/**
 * Which capture is being opened, not which mode the user is in.
 *
 * `managed` is LiveKit's talking mic and follows micMode. The other three are fixed
 * purposes: the singer's published mix, and the two loopback checks, whose shape is
 * decided by which check the user asked for rather than by the current mic mode.
 */
export type CapturePurpose = "managed" | "singing" | "mic-check-talk" | "mic-check-sing";

export interface CaptureProfileInput {
  purpose: CapturePurpose;
  micMode: MicMode;
  talkingNC: boolean;
  singingNC: boolean;
}

const SINGING_PROFILE: CaptureProfile = {
  nc: false,
  channels: 2,
  sampleRateHz: 48000,
  preset: "musicHQ",
  dtx: false,
};

export function resolveCaptureProfile({
  purpose,
  micMode,
  talkingNC,
  singingNC,
}: CaptureProfileInput): CaptureProfile {
  switch (purpose) {
    case "managed": {
      const raw = micMode === "raw";
      return {
        nc: raw ? singingNC : talkingNC,
        channels: raw ? 2 : 1,
        sampleRateHz: raw ? 48000 : null,
        preset: raw ? "musicStereo" : "voice",
        dtx: !raw,
      };
    }
    case "singing":
    case "mic-check-sing":
      return { ...SINGING_PROFILE, nc: singingNC };
    case "mic-check-talk":
      return { nc: talkingNC, channels: 1, sampleRateHz: null, preset: "voice", dtx: true };
  }
}

/**
 * The web driver's translation. A missing sample rate stays absent rather than
 * explicit-undefined, so the constraint set is exactly what each call site wrote.
 */
export function toMediaTrackConstraints(
  profile: CaptureProfile,
  deviceId: string,
): MediaTrackConstraints {
  return {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    echoCancellation: profile.nc,
    noiseSuppression: profile.nc,
    autoGainControl: profile.nc,
    channelCount: profile.channels,
    ...(profile.sampleRateHz === null ? {} : { sampleRate: profile.sampleRateHz }),
  };
}
