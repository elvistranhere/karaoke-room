"use client";

import type { ReactNode } from "react";

export const VOLUME_MAX = 200;
export const MUSIC_MAX = 100;

const DETENT_SNAP = 4;

interface VolumeSliderProps {
  label: string;
  icon?: ReactNode;
  value: number;
  max?: number;
  onChange: (value: number) => void;
  ariaLabel?: string;
  compact?: boolean;
  trailing?: ReactNode;
}

export function VolumeSlider({
  label,
  icon,
  value,
  max = VOLUME_MAX,
  onChange,
  ariaLabel,
  compact = false,
  trailing,
}: VolumeSliderProps) {
  const fill = Math.min(100, (value / max) * 100);
  const boosting = value > 100;
  const hasDetent = max > 100;

  const handleChange = (next: number) => {
    onChange(hasDetent && Math.abs(next - 100) <= DETENT_SNAP ? 100 : next);
  };

  return (
    <div className="flex items-center gap-3">
      {icon ? (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--color-dark-card)" }}>
          {icon}
        </span>
      ) : null}
      <span
        className={`${compact ? "w-14" : "w-11"} shrink-0 text-[10px] font-semibold uppercase tracking-wide`}
        style={{ color: "var(--color-text-secondary)" }}
      >
        {label}
        {boosting && (
          <span className="mt-0.5 block text-[8px] font-bold tracking-wider" style={{ color: "var(--color-accent)" }}>
            BOOST
          </span>
        )}
      </span>
      <div className="relative min-w-0 flex-1">
        <input
          type="range"
          min="0"
          max={max}
          value={value}
          aria-label={ariaLabel ?? label}
          onChange={(e) => handleChange(Number(e.target.value))}
          onDoubleClick={() => { if (hasDetent) onChange(100); }}
          className="volume-slider w-full"
          style={{
            background: boosting
              ? `linear-gradient(to right, var(--color-primary) 0%, var(--color-accent) ${fill}%, var(--color-dark-border) ${fill}%, var(--color-dark-border) 100%)`
              : `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${fill}%, var(--color-dark-border) ${fill}%, var(--color-dark-border) 100%)`,
          }}
        />
        {hasDetent && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 h-2.5 w-px -translate-y-1/2"
            style={{ left: `${(100 / max) * 100}%`, background: "color-mix(in srgb, var(--color-text-primary) 35%, transparent)" }}
          />
        )}
      </div>
      <span
        className="w-7 shrink-0 text-right text-[11px] tabular-nums"
        style={{ color: boosting ? "var(--color-accent)" : "var(--color-text-secondary)" }}
      >
        {value}
      </span>
      {trailing}
    </div>
  );
}
