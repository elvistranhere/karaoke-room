"use client";

import { useEffect, useState } from "react";
import { Mic, MicOff, SlidersHorizontal, Waves, Headphones, HeadphoneOff } from "lucide-react";
import type { Room } from "livekit-client";
import type { VoiceEffect } from "~/lib/voiceEffects";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { VoiceFxPopover } from "./VoiceFxPopover";

export type NoiseCancellationMode = "auto" | "on" | "off";

interface ToolbarProps {
  room: Room | null;
  isMicEnabled: boolean;
  toggleMic: () => Promise<void>;
  voiceEffect: VoiceEffect;
  onVoiceEffectChange: (effect: VoiceEffect) => void;
  effectWetDry: number;
  onEffectWetDry: (wet: number) => void;
  noiseCancellationMode: NoiseCancellationMode;
  onNoiseCancellationModeChange: (mode: NoiseCancellationMode) => void;
  ncActive: boolean;
  onSoundProfileOpen: () => void;
  deafened: boolean;
  onToggleDeafen: () => void;
}

const METER_BARS = [0.4, 0.65, 1, 0.65, 0.4];

const NC_LABELS: Record<NoiseCancellationMode, string> = {
  auto: "Auto",
  on: "On",
  off: "Off",
};

const CIRCLE_CLASS =
  "flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-[transform,background-color,box-shadow] duration-150 focus-visible:ring-3 focus-visible:ring-ring/50";

const PILL_CLASS =
  "flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97]";

export function Toolbar({
  room,
  isMicEnabled,
  toggleMic,
  deafened,
  onToggleDeafen,
  voiceEffect,
  onVoiceEffectChange,
  effectWetDry,
  onEffectWetDry,
  noiseCancellationMode,
  onNoiseCancellationModeChange,
  ncActive,
  onSoundProfileOpen,
}: ToolbarProps) {
  const [micLevel, setMicLevel] = useState(0);

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

  const micLabel = deafened
    ? "Turn sound back on to use your mic"
    : isMicEnabled
      ? "Mute microphone"
      : "Unmute microphone";
  const deafenLabel = deafened ? "Turn sound back on" : "Turn off all sound and your mic";
  // Deafen already reads as red on its own control, so a muted mic under deafen keeps
  // the danger fill rather than stacking a second alarm colour
  const micIsLive = isMicEnabled && !deafened;

  return (
    <div
      className="mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl border px-3 py-2.5"
      style={{
        background: "var(--color-dark-surface)",
        borderColor: "var(--color-dark-border)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.35), 0 1px 0 rgba(255, 255, 255, 0.03) inset",
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={<button type="button" disabled={deafened} />}
          onClick={toggleMic}
          className={`${CIRCLE_CLASS} ${deafened ? "cursor-not-allowed" : "cursor-pointer hover:scale-105 active:scale-[0.97]"}`}
          style={{
            background: micIsLive ? "var(--color-primary-soft)" : "var(--color-danger-dim)",
            color: micIsLive ? "#4c00af" : "var(--color-danger)",
            border: micIsLive ? "none" : "1px solid var(--color-danger)",
            boxShadow: micIsLive ? "0 6px 20px rgba(166, 110, 255, 0.22)" : "none",
            opacity: deafened ? 0.5 : 1,
          }}
          aria-label={micLabel}
        >
          {micIsLive ? <Mic className="size-5" strokeWidth={2.3} /> : <MicOff className="size-5" strokeWidth={2.3} />}
        </TooltipTrigger>
        <TooltipContent>{micLabel}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          onClick={onToggleDeafen}
          role="switch"
          aria-checked={deafened}
          className={`${CIRCLE_CLASS} cursor-pointer hover:scale-105 active:scale-[0.97]`}
          style={{
            background: deafened ? "var(--color-danger-dim)" : "var(--color-primary-soft, #c9a7ff)",
            color: deafened ? "var(--color-danger)" : "#4c00af",
            border: deafened ? "1px solid var(--color-danger)" : "none",
            boxShadow: deafened ? "none" : "0 6px 20px rgba(166, 110, 255, 0.22)",
          }}
          aria-label={deafenLabel}
        >
          {deafened ? <HeadphoneOff className="size-5" strokeWidth={2.3} /> : <Headphones className="size-5" strokeWidth={2.3} />}
        </TooltipTrigger>
        <TooltipContent>{deafenLabel}</TooltipContent>
      </Tooltip>

      <div
        className="hidden h-11 w-9 shrink-0 items-center justify-center gap-[3px] md:flex"
        role="meter"
        aria-label="Live microphone level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(micLevel * 100)}
        title={micIsLive ? `Microphone level ${Math.round(micLevel * 100)}%` : "Microphone muted"}
      >
        {METER_BARS.map((shape, index) => (
          <span
            key={index}
            className="w-[3px] rounded-full"
            style={{
              height: `${Math.max(4, Math.min(20, 4 + micLevel * 22 * shape))}px`,
              background: micIsLive ? "var(--color-primary-level)" : "var(--color-text-muted)",
              opacity: micIsLive ? 0.55 + micLevel * 0.45 : 0.25,
              transition: "height 90ms ease-out, opacity 120ms ease-out",
            }}
          />
        ))}
      </div>

      <div className="h-8 w-px shrink-0" style={{ background: "var(--color-dark-border)" }} />

      <Select value={noiseCancellationMode} onValueChange={(v) => onNoiseCancellationModeChange(v as NoiseCancellationMode)}>
        <Tooltip>
          <TooltipTrigger
            render={
              <SelectTrigger
                aria-label="Noise cancellation"
                className="shrink-0 cursor-pointer bg-[var(--color-dark-card)] text-xs"
                style={{ height: 40, borderRadius: 12, paddingLeft: 12, paddingRight: 8 }}
              >
                <span className="flex items-center gap-2">
                  <Waves size={14} style={{ color: "var(--color-primary-soft)" }} />
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: ncActive ? "var(--color-success)" : "var(--color-text-muted)" }}
                    aria-hidden
                  />
                  <SelectValue>
                    {(value: NoiseCancellationMode) =>
                      value === "auto"
                        ? `NC Auto · ${ncActive ? "on" : "off"}`
                        : `NC ${NC_LABELS[value] ?? NC_LABELS.auto}`}
                  </SelectValue>
                </span>
              </SelectTrigger>
            }
          />
          <TooltipContent>{ncActive ? "Noise cancellation is on right now" : "Noise cancellation is off right now"}</TooltipContent>
        </Tooltip>
        <SelectContent>
          <SelectItem value="auto">Auto</SelectItem>
          <SelectItem value="on">On</SelectItem>
          <SelectItem value="off">Off</SelectItem>
        </SelectContent>
      </Select>

      <VoiceFxPopover
        voiceEffect={voiceEffect}
        onVoiceEffectChange={onVoiceEffectChange}
        effectWetDry={effectWetDry}
        onEffectWetDry={onEffectWetDry}
        onAdvanced={onSoundProfileOpen}
        triggerClassName={PILL_CLASS}
      />

      <Tooltip>
        <TooltipTrigger
          onClick={onSoundProfileOpen}
          className={PILL_CLASS}
          style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
        >
          <SlidersHorizontal size={14} style={{ color: "var(--color-primary-soft)" }} />
          <span>Sound</span>
        </TooltipTrigger>
        <TooltipContent>Mic check, devices, and noise cancellation</TooltipContent>
      </Tooltip>
    </div>
  );
}
