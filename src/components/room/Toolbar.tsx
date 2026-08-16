"use client";

import { useEffect, useState } from "react";
import { Mic, MicOff, Settings, Waves, AudioLines, Headphones, HeadphoneOff } from "lucide-react";
import type { Room } from "livekit-client";
import type { VoiceEffect } from "~/lib/voiceEffects";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";

export type NoiseCancellationMode = "auto" | "on" | "off";

interface ToolbarProps {
  room: Room | null;
  isMicEnabled: boolean;
  toggleMic: () => Promise<void>;
  voiceEffect: VoiceEffect;
  onVoiceEffectChange: (effect: VoiceEffect) => void;
  onEffectWetDry: (wet: number) => void;
  noiseCancellationMode: NoiseCancellationMode;
  onNoiseCancellationModeChange: (mode: NoiseCancellationMode) => void;
  onSoundProfileOpen: () => void;
  deafened: boolean;
  onToggleDeafen: () => void;
}

const METER_BARS = [0.4, 0.65, 1, 0.65, 0.4];

export function Toolbar({
  room,
  isMicEnabled,
  toggleMic,
  deafened,
  onToggleDeafen,
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

  return (
    <div
      className="mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-2 rounded-[20px] border px-3 py-2.5"
      style={{
        background: "var(--color-dark-surface)",
        borderColor: "var(--color-dark-border)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.35), 0 1px 0 rgba(255, 255, 255, 0.03) inset",
      }}
    >
      <button
        onClick={toggleMic}
        disabled={deafened}
        className={`flex size-12 shrink-0 items-center justify-center rounded-full transition-[transform,background-color,box-shadow] duration-150 ${deafened ? "cursor-not-allowed" : "cursor-pointer hover:scale-105 active:scale-[0.97]"}`}
        style={{
          background: isMicEnabled ? "#c9a7ff" : "var(--color-dark-card)",
          color: isMicEnabled ? "#4c00af" : "var(--color-text-muted)",
          border: isMicEnabled ? "none" : "1px solid var(--color-dark-border)",
          boxShadow: isMicEnabled ? "0 6px 20px rgba(166, 110, 255, 0.22)" : "none",
          opacity: deafened ? 0.5 : 1,
        }}
        title={deafened ? "Turn sound back on to use your mic" : isMicEnabled ? "Mute microphone" : "Unmute microphone"}
        aria-label={deafened ? "Turn sound back on to use your mic" : isMicEnabled ? "Mute microphone" : "Unmute microphone"}
      >
        {isMicEnabled ? <Mic className="size-5" strokeWidth={2.3} /> : <MicOff className="size-5" strokeWidth={2.3} />}
      </button>

      <button
        onClick={onToggleDeafen}
        role="switch"
        aria-checked={deafened}
        className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full transition-[transform,background-color] duration-150 hover:scale-105 active:scale-[0.97]"
        style={{
          background: deafened ? "var(--color-danger-dim)" : "var(--color-dark-card)",
          color: deafened ? "var(--color-danger)" : "var(--color-text-muted)",
          border: deafened ? "1px solid var(--color-danger)" : "1px solid var(--color-dark-border)",
        }}
        title={deafened ? "Turn sound back on" : "Turn off all sound and your mic"}
        aria-label={deafened ? "Turn sound back on" : "Turn off all sound and your mic"}
      >
        {deafened ? <HeadphoneOff className="size-5" strokeWidth={2.3} /> : <Headphones className="size-5" strokeWidth={2.3} />}
      </button>

      <div
        className="hidden h-8 w-9 items-end justify-center gap-[3px] pb-1.5 md:flex"
        role="meter"
        aria-label="Live microphone level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(micLevel * 100)}
        title={isMicEnabled ? `Microphone level ${Math.round(micLevel * 100)}%` : "Microphone muted"}
      >
        {METER_BARS.map((shape, index) => (
          <span
            key={index}
            className="w-[3px] rounded-full"
            style={{
              height: `${Math.max(4, Math.min(20, 4 + micLevel * 22 * shape))}px`,
              background: isMicEnabled ? "#b78cff" : "var(--color-text-muted)",
              opacity: isMicEnabled ? 0.55 + micLevel * 0.45 : 0.25,
              transition: "height 90ms ease-out, opacity 120ms ease-out",
            }}
          />
        ))}
      </div>

      <div className="h-8 w-px shrink-0" style={{ background: "var(--color-dark-border)" }} />

      <Select value={noiseCancellationMode} onValueChange={(v) => onNoiseCancellationModeChange(v as NoiseCancellationMode)}>
        <SelectTrigger aria-label="Noise cancellation" title="Noise cancellation" className="h-10 w-[112px] shrink-0 cursor-pointer rounded-xl bg-[var(--color-dark-card)] text-xs">
          <span className="flex items-center gap-2">
            <Waves size={13} style={{ color: "#c9a7ff" }} />
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">NC Auto</SelectItem>
          <SelectItem value="on">NC On</SelectItem>
          <SelectItem value="off">NC Off</SelectItem>
        </SelectContent>
      </Select>

      <button
        type="button"
        role="switch"
        aria-checked={echoEnabled}
        onClick={toggleEcho}
        className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs transition-colors hover:border-[var(--color-primary)] active:scale-[0.97]"
        style={{
          background: echoEnabled ? "var(--color-primary-dim)" : "var(--color-dark-card)",
          borderColor: echoEnabled ? "var(--color-primary)" : "var(--color-dark-border)",
          color: echoEnabled ? "#d7bbff" : "var(--color-text-primary)",
        }}
        title="Toggle a light echo on your voice"
      >
        <AudioLines size={13} style={{ color: echoEnabled ? "#c9a7ff" : "var(--color-text-muted)" }} />
        <span>Echo</span>
        <Switch checked={echoEnabled} aria-hidden className="pointer-events-none" render={<span />} nativeButton={false} />
      </button>

      <button
        onClick={onSoundProfileOpen}
        className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs transition-colors hover:border-[var(--color-primary)] active:scale-[0.97]"
        style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
        title="Voice effects, mic check, and devices"
      >
        <Settings size={13} style={{ color: "var(--color-text-muted)" }} />
        <span>Effects</span>
      </button>
    </div>
  );
}
