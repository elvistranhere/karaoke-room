"use client";

import { useEffect } from "react";

// Keeps the screen awake while the user is in a room. A locked phone suspends the
// mic, Web Audio and the sync timers, so this prevents the failure rather than
// recovering from it. Unsupported browsers (iOS < 16.4, Firefox) just no-op.
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let cancelled = false;
    let sentinel: WakeLockSentinel | null = null;

    const request = async () => {
      if (cancelled || sentinel || document.visibilityState !== "visible") return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void next.release().catch(() => {});
          return;
        }
        sentinel = next;
        // The OS drops the lock on background or lock; clear the ref so the next
        // visibility change can re-request it.
        next.addEventListener("release", () => {
          if (sentinel === next) sentinel = null;
        });
      } catch {
        // Denied, or the document was not visible by the time the request landed
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void request();
    };

    void request();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      const held = sentinel;
      sentinel = null;
      if (held) void held.release().catch(() => {});
    };
  }, [active]);
}
