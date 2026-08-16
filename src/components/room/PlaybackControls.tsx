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
    <div className="flex shrink-0 items-center gap-2.5">
      <button
        onClick={onRestart}
        disabled={disabled}
        className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full shadow-[var(--shadow-control)] transition-[transform,filter] duration-150 hover:brightness-125 active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: "var(--color-dark-raised)", color: "var(--color-text-secondary)" }}
        title="Restart from the beginning for everyone"
        aria-label="Restart from the beginning for everyone"
      >
        <RotateCcw size={15} />
      </button>
      <button
        onClick={playing ? onPause : onPlay}
        disabled={disabled}
        className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full transition-[transform,filter,box-shadow] duration-150 hover:brightness-110 active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-40"
        style={{
          background: "linear-gradient(135deg, #9d5cff 0%, #7c3aed 100%)",
          color: "#fff",
          boxShadow: "0 6px 24px rgba(157, 92, 255, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.18)",
        }}
        title={playing ? "Pause for everyone" : "Play for everyone"}
        aria-label={playing ? "Pause for everyone" : "Play for everyone"}
      >
        {/* Play glyphs sit optically left of center; nudge to balance */}
        {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="translate-x-[1.5px]" />}
      </button>
    </div>
  );
}
