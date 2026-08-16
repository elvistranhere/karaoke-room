"use client";

import { useEffect } from "react";

// Dev is deliberately excluded: a cached shell fights the dev server's HMR assets, and
// skipping registration is not enough while a local prod build's worker still controls it.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void (async () => {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((r) => r.unregister()));
          const names = await caches.keys();
          await Promise.all(
            names.filter((name) => name.startsWith("karaoke-shell-")).map((name) => caches.delete(name))
          );
        } catch {
          // Nothing to clean up, or the browser refused: dev still works
        }
      })();
      return;
    }

    const version = process.env.NEXT_PUBLIC_SW_VERSION ?? "dev";
    navigator.serviceWorker.register(`/sw.js?v=${version}`).catch(() => {});
  }, []);

  return null;
}
