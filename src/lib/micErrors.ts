/**
 * What a failed microphone acquisition says, and how long it says it for.
 *
 * The two catch blocks that ask (the mic toggle and startSinging) classify the same
 * three cases and have always disagreed on the wording, so the copy travels with the
 * call site as a policy while the classification and the auto-clear rule live here.
 */

export type MicErrorKind = "denied" | "not-found" | "other";

export interface MicErrorPolicy {
  denied: string;
  // null where the call site has no wording of its own and the browser's message
  // is the better answer.
  notFound: string | null;
  // Used only when the thrown value is not an Error and has no message to show.
  fallback: string;
  // Only a denial or a missing device clears itself: both are states the user can
  // fix and retry. Anything else stays until the next attempt writes over it.
  autoClearMs: number | null;
}

export interface MicErrorVerdict {
  kind: MicErrorKind;
  message: string;
  autoClearMs: number | null;
}

export const MIC_TOGGLE_ERRORS: MicErrorPolicy = {
  denied: "Mic permission needed - click Unmute again",
  notFound: "No microphone found - check your device",
  fallback: "Mic failed",
  autoClearMs: 3000,
};

export const START_SINGING_ERRORS: MicErrorPolicy = {
  denied: "Microphone permission needed to sing",
  notFound: null,
  fallback: "Failed to start singing",
  autoClearMs: null,
};

export function classifyMicError(err: unknown, policy: MicErrorPolicy): MicErrorVerdict {
  const name = err instanceof Error ? err.name : "";
  const kind: MicErrorKind =
    name === "NotAllowedError" ? "denied" : name === "NotFoundError" ? "not-found" : "other";
  const copy = kind === "denied" ? policy.denied : kind === "not-found" ? policy.notFound : null;
  if (copy !== null) return { kind, message: copy, autoClearMs: policy.autoClearMs };
  return {
    kind,
    message: err instanceof Error ? err.message : policy.fallback,
    autoClearMs: null,
  };
}
