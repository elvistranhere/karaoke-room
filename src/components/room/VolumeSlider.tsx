"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { Slider } from "~/components/ui/slider";

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
  accent?: string;
}

export function VolumeSlider({
  label,
  icon,
  value,
  max = VOLUME_MAX,
  onChange,
  ariaLabel,
  compact = false,
  trailing, accent,
}: VolumeSliderProps) {
  const boosting = value > 100;
  const hasDetent = max > 100;
  const sliderValue = useMemo(() => [value], [value]);

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
        <Slider
          value={sliderValue}
          max={max}
          aria-label={ariaLabel ?? label}
          onValueChange={(next) => handleChange(typeof next === "number" ? next : next[0] ?? value)}
          onDoubleClick={() => { if (hasDetent) onChange(100); }}
          // The indicator keeps its bg-primary fill; the boost gradient rides on top as an
          // image so nothing has to out-specify the primitive's own colour.
          className="[&_[data-slot=slider-control]]:h-10 [&_[data-slot=slider-range]]:[background-image:var(--volume-fill)]"
          style={{
            "--volume-fill": boosting
              ? "linear-gradient(to right, var(--color-primary), var(--color-accent))"
              : "none",
            ...(accent ? { "--slider-accent": accent } : {}),
          } as CSSProperties}
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
