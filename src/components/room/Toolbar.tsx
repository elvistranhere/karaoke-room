"use client";

import { useCallback, useRef } from "react";
import type { MicMode } from "~/hooks/useAudioDevices";

interface ToolbarProps {
  isMicEnabled: boolean;
  toggleMic: () => Promise<void>;
  micMode: MicMode;
  onSoundProfileOpen: () => void;
  onReact: (emoji: string) => void;
}

const REACTIONS = ["🔥", "👏", "😍", "🎵", "💯", "🙌", "😂", "💀", "👎", "😴"];

export function Toolbar({
  isMicEnabled,
  toggleMic,
  micMode,
  onSoundProfileOpen,
  onReact,
}: ToolbarProps) {
  const cooldownRef = useRef(false);
  const handleReact = useCallback((emoji: string) => {
    if (cooldownRef.current) return;
    cooldownRef.current = true;
    onReact(emoji);
    setTimeout(() => { cooldownRef.current = false; }, 500);
  }, [onReact]);

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto rounded-xl border px-3 py-2.5"
      style={{ background: "var(--color-dark-surface)", borderColor: "var(--color-dark-border)" }}
    >
      {/* Mic toggle */}
      <button
        onClick={toggleMic}
        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all duration-150 hover:scale-105 active:scale-95"
        style={{
          fontFamily: "var(--font-display)",
          background: isMicEnabled ? "var(--color-primary-dim)" : "var(--color-primary)",
          color: isMicEnabled ? "var(--color-primary)" : "#fff",
          border: isMicEnabled ? "1px solid var(--color-primary)" : "none",
        }}
        title="Toggle microphone"
      >
        {isMicEnabled ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
        )}
        {isMicEnabled ? "Mute" : "Unmute"}
      </button>

      {/* Mode indicator (click opens Sound Profile) */}
      <button
        onClick={onSoundProfileOpen}
        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all hover:scale-105 hover:border-[var(--color-primary)]"
        style={{
          borderColor: "var(--color-dark-border)",
          color: micMode === "voice" ? "var(--color-primary)" : "var(--color-accent)",
          background: micMode === "voice" ? "var(--color-primary-dim)" : "var(--color-accent-dim)",
        }}
        title="Open Sound Profile — configure voice effects, mic settings, and devices"
      >
        {micMode === "voice" ? "💬 Talk" : "🎤 Sing"}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
          <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Reactions */}
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => handleReact(emoji)}
          className="shrink-0 cursor-pointer rounded-md px-1 py-0.5 text-base transition-transform hover:scale-125 active:scale-90"
          title={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
