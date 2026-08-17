import { describe, expect, it } from "vitest";

import { classifyMicError, MIC_TOGGLE_ERRORS, START_SINGING_ERRORS } from "./micErrors";

const named = (name: string, message = "browser wording"): Error => {
  const err = new Error(message);
  err.name = name;
  return err;
};

describe("classifyMicError, mic toggle", () => {
  it("names the denial and clears it after 3s", () => {
    expect(classifyMicError(named("NotAllowedError"), MIC_TOGGLE_ERRORS)).toEqual({
      kind: "denied",
      message: "Mic permission needed - click Unmute again",
      autoClearMs: 3000,
    });
  });

  it("names a missing device and clears it after 3s", () => {
    expect(classifyMicError(named("NotFoundError"), MIC_TOGGLE_ERRORS)).toEqual({
      kind: "not-found",
      message: "No microphone found - check your device",
      autoClearMs: 3000,
    });
  });

  it("shows any other error's own message and leaves it up", () => {
    expect(classifyMicError(named("OverconstrainedError"), MIC_TOGGLE_ERRORS)).toEqual({
      kind: "other",
      message: "browser wording",
      autoClearMs: null,
    });
  });

  it("falls back when the thrown value is not an Error", () => {
    expect(classifyMicError("nope", MIC_TOGGLE_ERRORS)).toEqual({
      kind: "other",
      message: "Mic failed",
      autoClearMs: null,
    });
  });
});

describe("classifyMicError, start singing", () => {
  it("has its own denial wording and never auto-clears", () => {
    expect(classifyMicError(named("NotAllowedError"), START_SINGING_ERRORS)).toEqual({
      kind: "denied",
      message: "Microphone permission needed to sing",
      autoClearMs: null,
    });
  });

  it("leaves a missing device to the browser's own message", () => {
    expect(classifyMicError(named("NotFoundError"), START_SINGING_ERRORS)).toEqual({
      kind: "not-found",
      message: "browser wording",
      autoClearMs: null,
    });
  });

  it("falls back when the thrown value is not an Error", () => {
    expect(classifyMicError({ nope: true }, START_SINGING_ERRORS)).toEqual({
      kind: "other",
      message: "Failed to start singing",
      autoClearMs: null,
    });
  });
});
