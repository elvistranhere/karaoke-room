"use client";

import { useCallback, useRef } from "react";
import { Mic, MicOff, Settings, MessageSquare, Music } from "lucide-react";
import type { MicMode } from "~/hooks/useAudioDevices";

interface ToolbarProps {
  isMicEnabled: boolean;
  toggleMic: () => Promise<void>;
  micMode: MicMode;
  onSoundProfileOpen: () => void;
  onReact: (emoji: string) => void;
}

import { REACTION_EMOJIS } from "~/lib/reactions";

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
        title={isMicEnabled ? "Mute microphone" : "Unmute microphone"}
      >
        {isMicEnabled ? <Mic size={14} /> : <MicOff size={14} />}
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
        {micMode === "voice" ? <><MessageSquare size={12} /> Talk</> : <><Music size={12} /> Sing</>}
        <Settings size={10} style={{ opacity: 0.5 }} />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Reactions */}
      {REACTION_EMOJIS.map((emoji) => (
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
