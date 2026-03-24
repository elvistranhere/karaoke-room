"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Reaction } from "~/hooks/useRoomState";

const REACTIONS = [
  { emoji: "🔥", label: "Fire", sound: 880 },
  { emoji: "👏", label: "Clap", sound: 660 },
  { emoji: "😍", label: "Love", sound: 523 },
  { emoji: "🎵", label: "Music", sound: 740 },
  { emoji: "💯", label: "100", sound: 988 },
  { emoji: "🙌", label: "Raise", sound: 1047 },
];

function playReactionSound(frequency: number) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    osc.onended = () => ctx.close();
  } catch {
    // AudioContext may not be available
  }
}

interface ReactionBarProps {
  reactions: Reaction[];
  onReact: (emoji: string) => void;
}

export function ReactionBar({ reactions, onReact }: ReactionBarProps) {
  const cooldownRef = useRef(false);
  const prevCountRef = useRef(0);

  // Play sound when new reactions arrive
  useEffect(() => {
    if (reactions.length > prevCountRef.current && reactions.length > 0) {
      const latest = reactions[reactions.length - 1]!;
      const def = REACTIONS.find((r) => r.emoji === latest.emoji);
      if (def) playReactionSound(def.sound);
    }
    prevCountRef.current = reactions.length;
  }, [reactions]);

  const handleReact = useCallback(
    (emoji: string) => {
      if (cooldownRef.current) return;
      cooldownRef.current = true;
      onReact(emoji);
      setTimeout(() => {
        cooldownRef.current = false;
      }, 500);
    },
    [onReact],
  );

  return (
    <div className="relative">
      {/* Floating reactions — z-50 to float above other panels */}
      <div className="pointer-events-none absolute inset-x-0 -top-16 z-50 h-20 overflow-visible">
        {reactions.map((r) => (
          <span
            key={r.id}
            className="absolute text-3xl"
            style={{
              left: `${Math.random() * 80 + 10}%`,
              bottom: 0,
              animation: "reaction-float 2.5s ease-out forwards",
            }}
          >
            {r.emoji}
          </span>
        ))}
      </div>

      {/* Reaction buttons */}
      <div
        className="flex items-center gap-1.5 rounded-xl border px-3 py-2"
        style={{
          background: "var(--color-dark-surface)",
          borderColor: "var(--color-dark-border)",
        }}
      >
        <span
          className="mr-1 text-xs"
          style={{ color: "var(--color-text-secondary)" }}
        >
          React
        </span>
        {REACTIONS.map(({ emoji, label }) => (
          <button
            key={emoji}
            onClick={() => handleReact(emoji)}
            className="cursor-pointer rounded-lg px-2 py-1 text-lg transition-transform duration-150 hover:scale-125 active:scale-90"
            style={{ background: "transparent" }}
            title={label}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
