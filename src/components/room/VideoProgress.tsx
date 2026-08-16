"use client";

import { useEffect, useState } from "react";
import type { YouTubePlayerHandle } from "~/hooks/useYouTubePlayer";

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

interface VideoProgressProps {
  player: YouTubePlayerHandle;
  active: boolean;
}

// Read-only on purpose: a seekable bar would broadcast seeks and drag the whole
// room through rebuffer churn, so the singer's Restart stays the only jump.
export function VideoProgress({ player, active }: VideoProgressProps) {
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!active) {
      setPosition(0);
      setDuration(0);
      return;
    }
    const tick = () => {
      setPosition(player.getTime());
      setDuration(player.getDuration());
    };
    tick();
    const interval = window.setInterval(tick, 500);
    return () => window.clearInterval(interval);
  }, [player, active]);

  if (!active || duration <= 0) return null;
  const fraction = Math.min(1, Math.max(0, position / duration));

  return (
    <div className="flex items-center gap-2 px-1" aria-hidden>
      <span className="shrink-0 text-[10px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>
        {formatTime(position)}
      </span>
      <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: "var(--color-dark-card)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${fraction * 100}%`,
            background: "linear-gradient(90deg, var(--atmo-a, var(--color-primary)), var(--atmo-b, var(--color-primary-soft, #c9a7ff)))",
            transition: "width 480ms linear",
          }}
        />
      </div>
      <span className="shrink-0 text-[10px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>
        {formatTime(duration)}
      </span>
    </div>
  );
}
