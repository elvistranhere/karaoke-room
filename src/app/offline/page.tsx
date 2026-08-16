"use client";

import { WifiOff } from "lucide-react";
import { buttonVariants } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export default function OfflinePage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-6">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 40% 40% at 20% 80%, var(--color-primary-dim), transparent), radial-gradient(ellipse 35% 35% at 80% 20%, var(--color-primary-dim), transparent)",
        }}
      />
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl p-7 text-center"
        style={{
          background: "color-mix(in srgb, var(--color-dark-surface) 88%, transparent)",
          boxShadow: "var(--shadow-elevation-3)",
        }}
      >
        <div
          className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl"
          style={{ background: "var(--color-primary-dim)", color: "var(--color-primary)" }}
        >
          <WifiOff size={24} />
        </div>
        <h1
          className="text-2xl font-extrabold"
          style={{
            fontFamily: "var(--font-display)",
            background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          You are offline
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Karaoke Now needs a connection to keep everyone singing in time. The room is
          still there, it is waiting for you.
        </p>
        {/* A plain link, not a button: this page is served by the service worker while
            offline, where nothing hydrates and an onClick handler would never run. */}
        <a
          href="/"
          className={cn(buttonVariants({ className: "mt-6 h-11 w-full font-bold" }))}
          style={{ fontFamily: "var(--font-display)" }}
        >
          Try again
        </a>
      </div>
    </main>
  );
}
