"use client";

import { ListMusic, Music, Plus } from "lucide-react";
import type { ParticipantStatus, RoomState } from "~/types/room";

interface QueuePanelProps {
  roomState: RoomState;
  myPeerId: string | null;
  participantStatus: Record<string, ParticipantStatus>;
  onRequestJoinQueue: () => void;
  onLeaveQueue: () => void;
}

export function QueuePanel({
  roomState,
  myPeerId,
  participantStatus,
  onRequestJoinQueue,
  onLeaveQueue,
}: QueuePanelProps) {
  const isInQueue = myPeerId ? roomState.queue.includes(myPeerId) : false;
  const isSinging = myPeerId !== null && roomState.currentSingerId === myPeerId;
  const isInQueueOrSinging = isInQueue || isSinging;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {roomState.queue.length > 0 ? (
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
          {roomState.queue.map((id, i) => {
            const participant = roomState.participants.find((p) => p.id === id);
            const song = participantStatus[id]?.currentSong?.trim() || null;
            const isMe = id === myPeerId;
            return (
              <li
                key={id}
                className="flex items-center gap-3 rounded-[calc(var(--radius-lg)+0.5rem)] p-2"
                style={{
                  background: isMe ? "var(--color-primary-dim)" : "var(--color-dark-card)",
                  boxShadow: "var(--shadow-elevation-0)",
                  animation: `slide-in 0.2s ease-out ${i * 0.04}s both`,
                }}
              >
                <div
                  className="flex size-11 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: isMe ? "var(--color-dark-card)" : "var(--color-dark-surface)",
                    color: "var(--color-accent)",
                  }}
                >
                  <Music size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium"
                    style={{ color: song ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}
                  >
                    {song ?? "Song not picked yet"}
                  </p>
                  <p className="mt-0.5 truncate text-xs" style={{ color: isMe ? "var(--color-primary)" : "var(--color-text-muted)" }}>
                    Requested by {isMe ? "you" : participant?.name ?? "Someone"}
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-1 text-xs font-bold tabular-nums"
                  style={{
                    fontFamily: "var(--font-display)",
                    background: "var(--color-primary-dim)",
                    color: "var(--color-primary)",
                  }}
                >
                  #{i + 1}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <div
            className="flex size-12 items-center justify-center rounded-full"
            style={{ background: "var(--color-dark-card)", color: "var(--color-text-muted)" }}
          >
            <ListMusic size={20} />
          </div>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)", textWrap: "pretty" }}>
            The queue is empty. Add a song to sing next.
          </p>
        </div>
      )}

      <div className="shrink-0 px-3 pb-3 pt-1">
        {!isInQueueOrSinging ? (
          <button
            onClick={onRequestJoinQueue}
            className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-bold transition-[filter,transform] duration-150 ease-out hover:brightness-110 active:scale-[0.98]"
            style={{
              fontFamily: "var(--font-display)",
              background: "color-mix(in srgb, var(--color-primary) 62%, white)",
              color: "color-mix(in srgb, var(--color-primary) 25%, black)",
            }}
          >
            <Plus size={16} />
            Add to Queue
          </button>
        ) : isSinging ? (
          <p className="py-3 text-center text-sm font-bold" style={{ color: "var(--color-primary)" }}>
            You&apos;re singing!
          </p>
        ) : (
          <button
            onClick={onLeaveQueue}
            className="min-h-11 w-full cursor-pointer rounded-lg text-sm font-medium shadow-[var(--shadow-elevation-0)] transition-[filter] duration-150 ease-out hover:brightness-125"
            style={{
              fontFamily: "var(--font-display)",
              background: "var(--color-dark-card)",
              color: "var(--color-text-secondary)",
            }}
          >
            Leave Queue
          </button>
        )}
      </div>
    </div>
  );
}
