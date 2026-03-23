"use client";

import type { Participant } from "~/types/room";

interface ParticipantListProps {
  participants: Participant[];
  currentSingerId: string | null;
  myPeerId: string | null;
}

export function ParticipantList({
  participants,
  currentSingerId,
  myPeerId,
}: ParticipantListProps) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{
        background: "var(--color-dark-surface)",
        borderColor: "var(--color-dark-border)",
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3
          className="text-sm uppercase tracking-widest"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--color-neon-yellow)",
            fontSize: "0.75rem",
          }}
        >
          In the Room
        </h3>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            background: "rgba(255, 225, 86, 0.15)",
            color: "var(--color-neon-yellow)",
          }}
        >
          {participants.length}
        </span>
      </div>

      <ul className="space-y-1.5">
        {participants.map((p, i) => (
          <li
            key={p.id}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm"
            style={{
              background:
                p.id === myPeerId
                  ? "rgba(0, 240, 255, 0.06)"
                  : "transparent",
              animation: `slide-in 0.3s ease-out ${i * 0.04}s both`,
            }}
          >
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
              style={{
                background:
                  p.id === currentSingerId
                    ? "rgba(255, 45, 120, 0.2)"
                    : "var(--color-dark-card)",
                color:
                  p.id === currentSingerId
                    ? "var(--color-neon-pink)"
                    : "var(--color-text-secondary)",
                fontFamily: "var(--font-display)",
              }}
            >
              {p.id === currentSingerId ? "🎤" : p.name.charAt(0).toUpperCase()}
            </div>
            <span
              style={{
                color:
                  p.id === myPeerId
                    ? "var(--color-neon-cyan)"
                    : "var(--color-text-primary)",
              }}
            >
              {p.name}
              {p.id === myPeerId && (
                <span
                  className="ml-1 text-xs"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  (you)
                </span>
              )}
            </span>
          </li>
        ))}

        {participants.length === 0 && (
          <li
            className="py-4 text-center text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            No one here yet
          </li>
        )}
      </ul>
    </div>
  );
}
