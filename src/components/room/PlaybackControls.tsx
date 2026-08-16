"use client";

import { Pause, Play, RotateCcw } from "lucide-react";

interface PlaybackControlsProps {
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  disabled?: boolean;
}

export function PlaybackControls({ playing, onPlay, onPause, onRestart, disabled = false }: PlaybackControlsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={playing ? onPause : onPlay}
        disabled={disabled}
        className="flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-[filter] duration-150 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ fontFamily: "var(--font-display)", background: "linear-gradient(135deg, #9d5cff 0%, #7c3aed 100%)", color: "#fff" }}
        title={playing ? "Pause for everyone" : "Play for everyone"}
      >
        {playing ? <Pause size={13} /> : <Play size={13} />}
        {playing ? "Pause" : "Play"}
      </button>
      <button
        onClick={onRestart}
        disabled={disabled}
        className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium shadow-[var(--shadow-elevation-0)] transition-[filter] duration-150 hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: "var(--color-dark-card)", color: "var(--color-text-secondary)" }}
        title="Restart from the beginning for everyone"
      >
        <RotateCcw size={12} />
        Restart
      </button>
    </div>
  );
}
