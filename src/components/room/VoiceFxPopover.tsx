"use client";

import { useState } from "react";
import { AudioLines, ChevronRight } from "lucide-react";
import { VOICE_EFFECTS, type VoiceEffect } from "~/lib/voiceEffects";
import { Slider } from "~/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";

interface VoiceFxPopoverProps {
  voiceEffect: VoiceEffect;
  onVoiceEffectChange: (effect: VoiceEffect) => void;
  effectWetDry: number;
  onEffectWetDry: (wet: number) => void;
  onAdvanced: () => void;
  triggerClassName?: string;
}

export function VoiceFxPopover({
  voiceEffect,
  onVoiceEffectChange,
  effectWetDry,
  onEffectWetDry,
  onAdvanced,
  triggerClassName,
}: VoiceFxPopoverProps) {
  const [open, setOpen] = useState(false);
  const active = voiceEffect !== "none";
  const activeLabel = VOICE_EFFECTS.find((fx) => fx.id === voiceEffect)?.label ?? "Voice FX";
  const wetPercent = Math.round(effectWetDry * 100);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              className={triggerClassName}
              aria-label={active ? `Voice effect: ${activeLabel}` : "Voice effects"}
              style={{
                background: active ? "var(--color-primary-dim)" : "var(--color-dark-card)",
                borderColor: active ? "color-mix(in srgb, var(--color-primary) 45%, transparent)" : "transparent",
                color: active ? "var(--color-primary-bright)" : "var(--color-text-primary)",
              }}
            >
              <AudioLines size={14} style={{ color: active ? "var(--color-primary-soft)" : "var(--color-text-muted)" }} />
              <span>{active ? activeLabel : "Voice FX"}</span>
            </PopoverTrigger>
          }
        />
        <TooltipContent>Voice effects</TooltipContent>
      </Tooltip>

      <PopoverContent
        side="top"
        className="w-[min(20rem,calc(100vw-1.5rem))] gap-3 rounded-2xl p-3"
        style={{ color: "var(--color-text-primary)" }}
      >
        <div className="grid grid-cols-3 gap-1.5">
          {VOICE_EFFECTS.map((fx) => {
            const selected = voiceEffect === fx.id;
            return (
              <button
                key={fx.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onVoiceEffectChange(fx.id)}
                className="min-h-10 cursor-pointer rounded-md border px-2 text-xs font-medium shadow-[var(--shadow-elevation-0)] outline-none transition-[background-color,border-color,transform] duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97]"
                style={{
                  fontFamily: "var(--font-display)",
                  background: selected ? "var(--color-primary-dim)" : "var(--color-dark-raised)",
                  borderColor: selected ? "color-mix(in srgb, var(--color-primary) 45%, transparent)" : "transparent",
                  color: selected ? "var(--color-primary-bright)" : "var(--color-text-secondary)",
                }}
                title={fx.description}
              >
                {fx.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2.5">
          <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-secondary)" }}>
            Intensity
          </span>
          <Slider
            value={[wetPercent]}
            disabled={!active}
            onValueChange={(next) => onEffectWetDry((typeof next === "number" ? next : next[0] ?? wetPercent) / 100)}
            aria-label="Effect intensity"
            className="min-w-0 flex-1 [&_[data-slot=slider-control]]:h-10"
          />
          <span className="w-7 shrink-0 text-right text-[11px] tabular-nums" style={{ color: "var(--color-text-secondary)" }}>
            {active ? wetPercent : 0}
          </span>
        </div>

        <button
          type="button"
          onClick={() => { setOpen(false); onAdvanced(); }}
          className="flex min-h-10 w-full cursor-pointer items-center justify-between rounded-md px-2.5 text-xs font-medium outline-none transition-colors hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50"
          style={{ color: "var(--color-primary)" }}
        >
          Advanced
          <ChevronRight size={14} />
        </button>
      </PopoverContent>
    </Popover>
  );
}
