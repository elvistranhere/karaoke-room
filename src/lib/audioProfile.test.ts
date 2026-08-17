import { describe, expect, it } from "vitest";

import {
  resolveCaptureProfile,
  toMediaTrackConstraints,
  type CaptureProfile,
  type CapturePurpose,
} from "./audioProfile";
import type { MicMode } from "~/hooks/useAudioDevices";

// One row per (micMode, purpose) cell, each holding the literal the call sites wrote
// before resolveCaptureProfile existed. NC is read with talkingNC true / singingNC
// false, so a cell that took the wrong toggle fails on the nc field alone.
const CELLS: { micMode: MicMode; purpose: CapturePurpose; expected: CaptureProfile }[] = [
  {
    micMode: "voice",
    purpose: "managed",
    expected: { nc: true, channels: 1, sampleRateHz: null, preset: "voice", dtx: true },
  },
  {
    micMode: "raw",
    purpose: "managed",
    expected: { nc: false, channels: 2, sampleRateHz: 48000, preset: "musicStereo", dtx: false },
  },
  {
    micMode: "voice",
    purpose: "singing",
    expected: { nc: false, channels: 2, sampleRateHz: 48000, preset: "musicHQ", dtx: false },
  },
  {
    micMode: "raw",
    purpose: "singing",
    expected: { nc: false, channels: 2, sampleRateHz: 48000, preset: "musicHQ", dtx: false },
  },
  {
    micMode: "voice",
    purpose: "mic-check-talk",
    expected: { nc: true, channels: 1, sampleRateHz: null, preset: "voice", dtx: true },
  },
  {
    micMode: "raw",
    purpose: "mic-check-talk",
    expected: { nc: true, channels: 1, sampleRateHz: null, preset: "voice", dtx: true },
  },
  {
    micMode: "voice",
    purpose: "mic-check-sing",
    expected: { nc: false, channels: 2, sampleRateHz: 48000, preset: "musicHQ", dtx: false },
  },
  {
    micMode: "raw",
    purpose: "mic-check-sing",
    expected: { nc: false, channels: 2, sampleRateHz: 48000, preset: "musicHQ", dtx: false },
  },
];

describe("resolveCaptureProfile", () => {
  for (const { micMode, purpose, expected } of CELLS) {
    it(`${purpose} in ${micMode} mode matches the literal it replaced`, () => {
      expect(resolveCaptureProfile({ purpose, micMode, talkingNC: true, singingNC: false }))
        .toEqual(expected);
    });
  }

  it("takes the talking toggle in voice mode and the singing toggle in raw mode", () => {
    const base = { purpose: "managed" as const, talkingNC: false, singingNC: true };
    expect(resolveCaptureProfile({ ...base, micMode: "voice" }).nc).toBe(false);
    expect(resolveCaptureProfile({ ...base, micMode: "raw" }).nc).toBe(true);
  });

  it("takes the singing toggle for every singing capture, whatever the mic mode", () => {
    for (const micMode of ["voice", "raw"] as const) {
      for (const purpose of ["singing", "mic-check-sing"] as const) {
        expect(resolveCaptureProfile({ purpose, micMode, talkingNC: false, singingNC: true }).nc)
          .toBe(true);
      }
    }
  });

  it("takes the talking toggle for the talking check, whatever the mic mode", () => {
    for (const micMode of ["voice", "raw"] as const) {
      expect(
        resolveCaptureProfile({ purpose: "mic-check-talk", micMode, talkingNC: true, singingNC: false }).nc,
      ).toBe(true);
    }
  });
});

describe("toMediaTrackConstraints", () => {
  const singing = resolveCaptureProfile({
    purpose: "singing",
    micMode: "voice",
    talkingNC: false,
    singingNC: true,
  });

  it("writes the exact singing constraint set", () => {
    expect(toMediaTrackConstraints(singing, "dev-1")).toEqual({
      deviceId: { exact: "dev-1" },
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 2,
      sampleRate: 48000,
    });
  });

  it("leaves deviceId unconstrained when there is no selection", () => {
    expect(toMediaTrackConstraints(singing, "").deviceId).toBeUndefined();
  });

  it("omits sampleRate entirely when the profile does not pin one", () => {
    const talk = resolveCaptureProfile({
      purpose: "mic-check-talk",
      micMode: "voice",
      talkingNC: false,
      singingNC: false,
    });
    const constraints = toMediaTrackConstraints(talk, "dev-1");
    expect("sampleRate" in constraints).toBe(false);
    expect(constraints).toEqual({
      deviceId: { exact: "dev-1" },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    });
  });
});
