"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { playStageChime } from "~/lib/chime";

const DISMISS_MS = 3000;

interface StageAnnouncementProps {
  singerId: string | null;
  singerName: string | null;
  isMyTurn: boolean;
  /** True once the join gesture has run, so the chime is autoplay-safe */
  armed: boolean;
  deafened: boolean;
}

export function StageAnnouncement({ singerId, singerName, isMyTurn, armed, deafened }: StageAnnouncementProps) {
  const [seenSingerId, setSeenSingerId] = useState(singerId);
  const [announcedId, setAnnouncedId] = useState<string | null>(null);

  // The singer in place on the first render is not a takeover, so only later
  // transitions announce
  if (singerId !== seenSingerId) {
    setSeenSingerId(singerId);
    setAnnouncedId(singerId);
  }

  const dismiss = useCallback(() => setAnnouncedId(null), []);

  if (!announcedId || !singerName) return null;

  return (
    <StageSweep
      key={announcedId}
      name={singerName}
      isMyTurn={isMyTurn}
      chime={isMyTurn && armed && !deafened}
      onDismiss={dismiss}
    />
  );
}

function StageSweep({
  name,
  isMyTurn,
  chime,
  onDismiss,
}: {
  name: string;
  isMyTurn: boolean;
  chime: boolean;
  onDismiss: () => void;
}) {
  const chimeRef = useRef(chime);
  chimeRef.current = chime;

  useEffect(() => {
    if (chimeRef.current) playStageChime();
    const timer = setTimeout(onDismiss, DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const tint = "var(--color-primary)";

  return (
    <div
      className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center overflow-hidden px-4"
      aria-live="polite"
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(100deg, transparent 20%, color-mix(in srgb, ${tint} 22%, transparent) 50%, transparent 80%)`,
          animation: "stage-sweep 1.1s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        }}
      />
      <div
        className="relative flex max-w-full flex-col items-center gap-3 rounded-2xl border px-6 py-5 text-center backdrop-blur-md"
        style={{
          background: "color-mix(in srgb, var(--color-dark-surface) 88%, transparent)",
          borderColor: `color-mix(in srgb, ${tint} 45%, transparent)`,
          boxShadow: `0 18px 48px rgba(0, 0, 0, 0.45), 0 0 32px color-mix(in srgb, ${tint} 18%, transparent)`,
          animation: `stage-announce-card ${isMyTurn ? "3s" : "2.8s"} cubic-bezier(0.22, 1, 0.36, 1) forwards`,
        }}
      >
        <span
          className="flex size-14 items-center justify-center rounded-full"
          style={{
            background: `color-mix(in srgb, ${tint} 18%, transparent)`,
            color: tint,
            animation: "stage-announce-glyph 2.9s cubic-bezier(0.22, 1, 0.36, 1) 0.06s both",
          }}
        >
          <Mic size={isMyTurn ? 30 : 26} strokeWidth={2.2} />
        </span>
        <span
          className="block"
          style={{ animation: "stage-announce-line 2.9s cubic-bezier(0.22, 1, 0.36, 1) 0.14s both" }}
        >
          <span
            className={`block font-extrabold ${isMyTurn ? "text-3xl" : "text-2xl"}`}
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}
          >
            {isMyTurn ? "You're up!" : name}
          </span>
          <span
            className="mt-1 block text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ color: tint, animation: "stage-announce-line 2.9s cubic-bezier(0.22, 1, 0.36, 1) 0.22s both" }}
          >
            {isMyTurn ? "Take the stage" : "is on stage"}
          </span>
        </span>
      </div>
    </div>
  );
}
