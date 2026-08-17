"use client";

import { useEffect } from "react";
import { initAnalytics } from "~/lib/analytics";

// Mounted once from the root layout so the error sink is registered before anything can
// fail. With no NEXT_PUBLIC_POSTHOG_KEY this costs one no-op effect and loads nothing.
export function Analytics() {
  useEffect(() => {
    initAnalytics();
  }, []);

  return null;
}
