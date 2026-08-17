import { describe, expect, it } from "vitest";

import {
  DEFAULT_WET_DRY,
  parseStoredVoiceEffect,
  parseStoredWetDry,
  VOICE_EFFECTS,
} from "./voiceEffects";

describe("parseStoredVoiceEffect", () => {
  it("restores every effect the picker can write", () => {
    for (const effect of VOICE_EFFECTS) {
      expect(parseStoredVoiceEffect(effect.id)).toBe(effect.id);
    }
  });

  it("reads nothing stored as no effect", () => {
    expect(parseStoredVoiceEffect(null)).toBe("none");
  });

  it("reads an unknown value as no effect", () => {
    expect(parseStoredVoiceEffect("telephone")).toBe("none");
    expect(parseStoredVoiceEffect("")).toBe("none");
  });
});

describe("parseStoredWetDry", () => {
  it("restores a stored value inside the range, ends included", () => {
    expect(parseStoredWetDry("0")).toBe(0);
    expect(parseStoredWetDry("0.35")).toBe(0.35);
    expect(parseStoredWetDry("1")).toBe(1);
  });

  it("falls back on nothing stored, on junk and on out of range", () => {
    for (const raw of [null, "wet", "-0.1", "1.1", "Infinity"]) {
      expect(parseStoredWetDry(raw)).toBe(DEFAULT_WET_DRY);
    }
  });

  // Number("") is 0, and a fully dry chain is what an empty entry has always meant
  it("reads an empty entry as fully dry", () => {
    expect(parseStoredWetDry("")).toBe(0);
  });
});
