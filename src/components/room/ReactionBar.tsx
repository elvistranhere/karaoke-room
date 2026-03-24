"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Reaction } from "~/hooks/useRoomState";

const REACTIONS = [
  { emoji: "🔥", label: "Fire" },
  { emoji: "👏", label: "Clap" },
  { emoji: "😍", label: "Love" },
  { emoji: "🎵", label: "Music" },
  { emoji: "💯", label: "100" },
  { emoji: "🙌", label: "Raise" },
];

// --- Web Audio API synthesized sounds (zero dependencies) ---

function playClap(ctx: AudioContext) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.02));
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 1000;
  const gain = ctx.createGain();
  gain.gain.value = 0.15;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start();
  return src;
}

function playPop(ctx: AudioContext, freq: number) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ctx.currentTime + 0.1);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.12);
  return osc;
}

function playChime(ctx: AudioContext, notes: number[]) {
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    const t = ctx.currentTime + i * 0.06;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.08, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  });
}

function playShimmer(ctx: AudioContext) {
  [880, 1100, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    const t = ctx.currentTime + i * 0.03;
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  });
}

export function playReactionSound(emoji: string) {
  try {
    const ctx = new AudioContext();
    switch (emoji) {
      case "🔥":
        playChime(ctx, [440, 554, 659, 880]);
        break;
      case "👏":
        playClap(ctx);
        break;
      case "😍":
        playShimmer(ctx);
        break;
      case "🎵":
        playChime(ctx, [523, 659, 784]);
        break;
      case "💯":
        playPop(ctx, 1200);
        break;
      case "🙌":
        playChime(ctx, [659, 784, 988, 1047]);
        break;
      default:
        playPop(ctx, 880);
    }
    setTimeout(() => ctx.close(), 500);
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
      playReactionSound(latest.emoji);
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
