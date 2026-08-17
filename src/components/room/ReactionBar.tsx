"use client";

import { useCallback, useRef } from "react";
import type { Reaction } from "~/hooks/useRoomState";
import type { SfxTarget } from "~/lib/voiceMixer";

const REACTIONS = [
  { emoji: "🔥", label: "Fire" },
  { emoji: "💯", label: "100" },
  { emoji: "😢", label: "Sad" },
  { emoji: "🎵", label: "Music" },
  { emoji: "❤️", label: "Heart" },
];

// --- Web Audio API synthesized sounds (zero dependencies) ---

function playPop(ctx: AudioContext, out: AudioNode, freq: number) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ctx.currentTime + 0.1);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
  osc.connect(gain).connect(out);
  osc.start();
  osc.stop(ctx.currentTime + 0.18);
  return osc;
}

function playChime(ctx: AudioContext, out: AudioNode, notes: number[]) {
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    const t = ctx.currentTime + i * 0.06;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.05, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + 0.3);
  });
}

function playShimmer(ctx: AudioContext, out: AudioNode) {
  [880, 1100, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    const t = ctx.currentTime + i * 0.03;
    gain.gain.setValueAtTime(0.04, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + 0.38);
  });
}

// Renders into the voice mixer's context on its own bus: this was a module-level
// context that was never closed, and it outlived every room the tab ever joined.
export function playReactionSound(emoji: string, target: SfxTarget | null) {
  if (!target) return;
  const { ctx, destination: out } = target;
  try {
    switch (emoji) {
      case "🔥":
        playChime(ctx, out, [440, 554, 659, 880]);
        break;
      case "🎵":
        playChime(ctx, out, [523, 659, 784]);
        break;
      case "💯":
        playPop(ctx, out, 1200);
        break;
      case "😢":
        playChime(ctx, out, [440, 330, 220]);
        break;
      case "❤️":
        playShimmer(ctx, out);
        break;
      default:
        playPop(ctx, out, 880);
    }
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
  // Sound playback is handled by RoomView — this component only renders UI

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
              left: `${r.left}%`,
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
        className="flex items-center gap-1.5 rounded-xl px-3 py-2"
        style={{
          background: "var(--color-dark-surface)",
          boxShadow: "var(--shadow-elevation-1)",
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
