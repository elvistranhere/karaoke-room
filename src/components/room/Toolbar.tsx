"use client";

import { useEffect, useState } from "react";
import { Mic, MicOff, Settings, Waves, AudioLines } from "lucide-react";
import type { Room } from "livekit-client";
import type { VoiceEffect } from "~/lib/voiceEffects";

export type NoiseCancellationMode = "auto" | "on" | "off";

interface ToolbarProps {
  room: Room | null;
  isMicEnabled: boolean;
  toggleMic: () => Promise<void>;
  micVolume: number;
  onMicVolumeChange: (volume: number) => void;
  voiceEffect: VoiceEffect;
  onVoiceEffectChange: (effect: VoiceEffect) => void;
  onEffectWetDry: (wet: number) => void;
  noiseCancellationMode: NoiseCancellationMode;
  onNoiseCancellationModeChange: (mode: NoiseCancellationMode) => void;
  onSoundProfileOpen: () => void;
}

export function Toolbar({
  room,
  isMicEnabled,
  toggleMic,
  micVolume,
  onMicVolumeChange,
  voiceEffect,
  onVoiceEffectChange,
  onEffectWetDry,
  noiseCancellationMode,
  onNoiseCancellationModeChange,
  onSoundProfileOpen,
}: ToolbarProps) {
  const [micLevel, setMicLevel] = useState(0);
  const echoEnabled = voiceEffect === "echo";

  const toggleEcho = () => {
    if (echoEnabled) {
      onVoiceEffectChange("none");
      return;
    }

    onEffectWetDry(0.2);
    onVoiceEffectChange("echo");
  };

  useEffect(() => {
    if (!room || !isMicEnabled) {
      setMicLevel(0);
      return;
    }

    const updateLevel = () => {
      const liveLevel = Math.min(1, Math.max(0, room.localParticipant.audioLevel || 0));
      setMicLevel((previous) => previous * 0.55 + liveLevel * 0.45);
    };
    updateLevel();
    const interval = window.setInterval(updateLevel, 75);
    return () => window.clearInterval(interval);
  }, [room, isMicEnabled]);

  const meterBars = [0.35, 0.55, 0.78, 1, 0.78, 0.55, 0.35];

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 sm:gap-4"
      style={{ background: "var(--color-dark-surface)", borderColor: "var(--color-dark-border)" }}
    >
      <button
        onClick={toggleMic}
        className="flex size-14 shrink-0 cursor-pointer items-center justify-center rounded-full transition-all duration-150 hover:scale-105 active:scale-95 sm:size-16"
        style={{
          background: isMicEnabled ? "#c9a7ff" : "var(--color-dark-card)",
          color: isMicEnabled ? "#4c00af" : "var(--color-text-muted)",
          border: isMicEnabled ? "none" : "1px solid var(--color-dark-border)",
          boxShadow: isMicEnabled ? "0 8px 24px rgba(166, 110, 255, 0.18)" : "none",
        }}
        title={isMicEnabled ? "Mute microphone" : "Unmute microphone"}
        aria-label={isMicEnabled ? "Mute microphone" : "Unmute microphone"}
      >
        {isMicEnabled ? <Mic className="size-6 sm:size-7" strokeWidth={2.3} /> : <MicOff className="size-6 sm:size-7" strokeWidth={2.3} />}
      </button>

      <div
        className="hidden h-10 items-center gap-1 md:flex"
        role="meter"
        aria-label="Live microphone level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(micLevel * 100)}
        title={isMicEnabled ? `Microphone level ${Math.round(micLevel * 100)}%` : "Microphone muted"}
      >
        {meterBars.map((shape, index) => (
          <span
            key={`${shape}-${index}`}
            className="w-0.5 rounded-full"
            style={{
              height: `${Math.max(5, Math.min(38, 5 + micLevel * 40 * shape))}px`,
              background: isMicEnabled ? "#b78cff" : "var(--color-text-muted)",
              opacity: isMicEnabled ? 0.55 + micLevel * 0.45 : 0.25,
              transition: "height 90ms ease-out, opacity 120ms ease-out",
            }}
          />
        ))}
      </div>

      <div className="hidden h-10 w-px sm:block" style={{ background: "var(--color-dark-border)" }} />

      <div className="min-w-32 flex-1">
        <label htmlFor="mic-volume" className="sr-only">Mic volume</label>
        <input
          id="mic-volume"
          type="range"
          min={0}
          max={100}
          value={micVolume}
          onChange={(event) => onMicVolumeChange(Number(event.target.value))}
          className="volume-slider h-2 w-full cursor-pointer rounded-full disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            background: `linear-gradient(to right, #c9a7ff 0%, #c9a7ff ${micVolume}%, var(--color-dark-border) ${micVolume}%, var(--color-dark-border) 100%)`,
          }}
          aria-label="Microphone volume"
          disabled={!isMicEnabled}
        />
      </div>

      <div className="grid w-full grid-cols-3 gap-2 border-t pt-3 sm:flex sm:w-auto sm:border-0 sm:pt-0" style={{ borderColor: "var(--color-dark-border)" }}>
        <div className="min-w-0">
          <label htmlFor="noise-cancellation" className="mb-1.5 block truncate text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
            Noise cancellation
          </label>
          <div className="relative">
            <Waves className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" size={13} style={{ color: "#c9a7ff" }} />
            <select
              id="noise-cancellation"
              value={noiseCancellationMode}
              onChange={(event) => onNoiseCancellationModeChange(event.target.value as NoiseCancellationMode)}
              className="h-8 w-full min-w-28 cursor-pointer appearance-none rounded-lg border pl-8 pr-7 text-xs capitalize outline-none transition-colors hover:border-[var(--color-primary)]"
              style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
              title="Choose noise cancellation behavior"
            >
              <option value="auto">Auto</option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: "var(--color-text-muted)" }}>⌄</span>
          </div>
        </div>

        <div className="min-w-0">
          <p className="mb-1.5 truncate text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Echo</p>
          <button
            type="button"
            role="switch"
            aria-checked={echoEnabled}
            onClick={toggleEcho}
            className="flex h-8 w-full min-w-24 cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 text-xs transition-colors hover:border-[var(--color-primary)]"
            style={{
              background: echoEnabled ? "var(--color-primary-dim)" : "var(--color-dark-card)",
              borderColor: echoEnabled ? "var(--color-primary)" : "var(--color-dark-border)",
              color: echoEnabled ? "#d7bbff" : "var(--color-text-primary)",
            }}
            title="Toggle a 20% echo effect"
          >
            <span className="flex items-center gap-1.5">
              <AudioLines size={13} style={{ color: echoEnabled ? "#c9a7ff" : "var(--color-text-muted)" }} />
              <span>{echoEnabled ? "On" : "Off"}</span>
            </span>
            <span
              className="relative h-4 w-7 rounded-full transition-colors"
              style={{ background: echoEnabled ? "var(--color-primary)" : "var(--color-dark-border)" }}
            >
              <span
                className="absolute top-0.5 size-3 rounded-full bg-white transition-transform"
                style={{ left: 2, transform: echoEnabled ? "translateX(12px)" : "translateX(0)" }}
              />
            </span>
          </button>
        </div>

        <div className="min-w-0">
          <p className="mb-1.5 truncate text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Effects</p>
          <button
            onClick={onSoundProfileOpen}
            className="flex h-8 w-full min-w-24 cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 text-xs transition-colors hover:border-[var(--color-primary)]"
            style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
            title="Open advanced sound effects and settings"
          >
            <span>Advanced</span>
            <Settings size={12} style={{ color: "var(--color-text-muted)" }} />
          </button>
        </div>
      </div>
    </div>
  );
}
