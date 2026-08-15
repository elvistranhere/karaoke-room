"use client";

import { useState } from "react";
import { Mic, MicOff, Music, Globe, Crown, MoreVertical, Plus } from "lucide-react";
import type { Participant, ParticipantStatus, RoomState } from "~/types/room";

interface PeoplePanelProps {
  roomState: RoomState;
  myPeerId: string | null;
  onRequestJoinQueue: () => void;
  onLeaveQueue: () => void;
  participantStatus: Record<string, ParticipantStatus>;
  activeSpeakers: Set<string>;
  personVolumes: Record<string, number>;
  onPersonVolumeChange: (identity: string, vol: number) => void;
  onKick?: (peerId: string) => void;
  onTransferAdmin?: (peerId: string) => void;
  onRemoveFromQueue?: (peerId: string) => void;
}

export function PeoplePanel({
  roomState,
  myPeerId,
  onRequestJoinQueue,
  onLeaveQueue,
  participantStatus,
  activeSpeakers,
  personVolumes,
  onPersonVolumeChange,
  onKick,
  onTransferAdmin,
  onRemoveFromQueue,
}: PeoplePanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminMenuId, setAdminMenuId] = useState<string | null>(null);
  const isAdmin = myPeerId !== null && roomState.adminPeerId === myPeerId;

  const isInQueue = myPeerId ? roomState.queue.includes(myPeerId) : false;
  const isSinging = myPeerId !== null && roomState.currentSingerId === myPeerId;
  const isInQueueOrSinging = isInQueue || isSinging;

  // Build a unified list: participants with their queue position
  const queuePositions = new Map(roomState.queue.map((id, i) => [id, i + 1]));

  return (
    <div
      className="flex h-full min-h-0 flex-col rounded-2xl border"
      style={{ background: "var(--color-dark-surface)", borderColor: "var(--color-dark-border)" }}
    >
      <div className="flex shrink-0 items-center border-b px-4 py-4" style={{ borderColor: "var(--color-dark-border)" }}>
        <h3 className="text-base font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
          Participants ({roomState.participants.length})
        </h3>
      </div>

      <ul className="min-h-0 flex-1 space-y-1 overflow-auto px-3 py-2">
        {roomState.participants.map((p) => {
          const isMe = p.id === myPeerId;
          const isSpeaking = Array.from(activeSpeakers).some((id) =>
            id.startsWith(p.name + "-") || id === p.name
          );
          const queuePos = queuePositions.get(p.id);
          const isSinger = p.id === roomState.currentSingerId;
          const status = participantStatus[p.id];
          const isExpanded = expandedId === p.id && !isMe;

          // Use LiveKit identity from status (broadcast via PartyKit) — no DOM queries needed
          const lkIdentity = status?.lkIdentity ?? p.name;
          const personVol = personVolumes[lkIdentity] ?? 1;

          return (
            <li key={p.id}>
              <div
                onClick={() => !isMe && setExpandedId(isExpanded ? null : p.id)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-150 ${!isMe ? "row-clickable cursor-pointer" : ""}`}
                onContextMenu={(e) => { if (!isMe) { e.preventDefault(); setExpandedId(isExpanded ? null : p.id); } }}
                style={{
                  background: isSpeaking
                    ? "rgba(139, 92, 246, 0.15)"
                    : isSinger
                      ? "var(--color-primary-dim)"
                    : isMe
                      ? "rgba(139, 92, 246, 0.05)"
                      : undefined,
                  boxShadow: isSpeaking
                    ? "inset 0 0 0 1px rgba(139, 92, 246, 0.4)"
                    : isSinger
                      ? "0 0 14px rgba(139, 92, 246, 0.18), inset 0 0 0 1px rgba(139, 92, 246, 0.35)"
                    : isExpanded
                      ? "0 0 8px rgba(139, 92, 246, 0.3), inset 0 0 0 1px rgba(139, 92, 246, 0.2)"
                      : undefined,
                }}
              >
                {/* Avatar */}
                <div
                  className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    fontFamily: "var(--font-display)",
                    background: isSinger
                      ? "var(--color-primary-dim)"
                      : isSpeaking
                        ? "rgba(139, 92, 246, 0.3)"
                        : "var(--color-dark-card)",
                    color: isSinger || isSpeaking
                      ? "var(--color-primary)"
                      : "var(--color-text-muted)",
                  }}
                >
                  {isSinger ? <Mic size={14} /> : p.name.charAt(0).toUpperCase()}
                  {isSpeaking && (
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{ border: "2px solid var(--color-primary)", animation: "pulse-ring 1.2s ease-out infinite" }}
                    />
                  )}
                </div>

                {/* Name + status */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {p.id === roomState.adminPeerId && (
                      <Crown size={12} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                    )}
                    <span
                      className="truncate text-sm"
                      style={{ color: isMe ? "var(--color-primary)" : "var(--color-text-primary)" }}
                    >
                      {p.name}
                    </span>
                    {isMe && (
                      <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>(you)</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                    {p.id === roomState.adminPeerId ? "Host" : isSinger ? "On stage" : "Listening"}
                  </p>
                </div>

                {/* Badges */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {queuePos && !isSinger && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ background: "var(--color-primary-dim)", color: "var(--color-primary)" }}
                    >
                      #{queuePos}
                    </span>
                  )}
                  {status?.browser && (
                    <span className="flex items-center gap-0.5 text-[9px]" style={{ color: "var(--color-text-muted)", opacity: 0.6 }}>
                      <Globe size={9} />
                      {status.browser}
                    </span>
                  )}
                  {status && (
                    status.isMuted
                      ? <MicOff size={12} style={{ color: "var(--color-text-muted)", opacity: 0.5 }} />
                      : <Mic size={12} style={{ color: "var(--color-primary)" }} />
                  )}
                  {status?.isSharingAudio && (
                    <Music size={12} style={{ color: "var(--color-accent)" }} />
                  )}
                  {isAdmin && !isMe && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setAdminMenuId(adminMenuId === p.id ? null : p.id); }}
                      className="cursor-pointer rounded p-0.5 transition-all hover:bg-[var(--color-dark-card)]"
                      style={{ color: "var(--color-text-muted)" }}
                      title="Admin actions"
                    >
                      <MoreVertical size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Admin actions menu */}
              {adminMenuId === p.id && isAdmin && !isMe && (
                <div
                  className="ml-9 flex flex-wrap gap-1 rounded-lg px-2 py-1.5"
                  style={{ background: "var(--color-dark-card)", animation: "fade-in 0.1s ease-out" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {onRemoveFromQueue && queuePos ? (
                    <button
                      onClick={() => { onRemoveFromQueue(p.id); setAdminMenuId(null); }}
                      className="cursor-pointer rounded px-2.5 py-1.5 text-[11px] font-medium transition-all hover:brightness-110"
                      style={{ background: "var(--color-dark-surface)", color: "var(--color-text-secondary)" }}
                    >
                      Remove from queue
                    </button>
                  ) : null}
                  <button
                    onClick={() => { onKick?.(p.id); setAdminMenuId(null); }}
                    className="cursor-pointer rounded px-2.5 py-1.5 text-[11px] font-medium transition-all hover:brightness-110"
                    style={{ background: "var(--color-danger-dim)", color: "var(--color-danger)" }}
                  >
                    Kick
                  </button>
                  <button
                    onClick={() => { onTransferAdmin?.(p.id); setAdminMenuId(null); }}
                    className="cursor-pointer rounded px-2.5 py-1.5 text-[11px] font-medium transition-all hover:brightness-110"
                    style={{ background: "var(--color-primary-dim)", color: "var(--color-primary)" }}
                  >
                    Make Admin
                  </button>
                </div>
              )}

              {/* Per-person volume slider */}
              {isExpanded && (
                <div
                  className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2"
                  style={{ background: "var(--color-dark-card)", animation: "fade-in 0.1s ease-out" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="shrink-0 text-[10px] uppercase" style={{ color: "var(--color-text-muted)" }}>Vol</span>
                  <input
                    type="range" min="0" max="100"
                    value={Math.round(personVol * 100)}
                    onChange={(e) => onPersonVolumeChange(lkIdentity, Number(e.target.value) / 100)}
                    className="volume-slider flex-1"
                  />
                  <span className="w-5 text-right text-[10px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                    {Math.round(personVol * 100)}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Song queue */}
      {(roomState.currentSingerId !== null || roomState.queue.length > 0) && <section className="flex max-h-[46%] shrink-0 flex-col border-t" style={{ borderColor: "var(--color-dark-border)" }}>
        <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-4">
          <h3 className="text-sm font-medium" style={{ fontFamily: "var(--font-display)", color: "color-mix(in srgb, var(--color-primary) 65%, white)" }}>
            Song Queue
          </h3>
          <span className="rounded-full border px-2 py-0.5 text-[9px] font-semibold" style={{ borderColor: "var(--color-dark-border)", color: "var(--color-text-muted)" }}>
            {roomState.queue.length} queued
          </span>
        </div>

        {roomState.queue.length > 0 ? (
          <div className="min-h-0 overflow-y-auto px-3 pb-2">
            <ul className="space-y-1">
              {roomState.queue.map((id, i) => {
                const participant = roomState.participants.find((p) => p.id === id);
                const song = participantStatus[id]?.currentSong?.trim() || "Unknown";
                const isMe = id === myPeerId;
                return (
                  <li
                    key={id}
                    className="flex items-center gap-3 rounded-lg px-2 py-2"
                    style={{ background: isMe ? "var(--color-primary-dim)" : "transparent", animation: `slide-in 0.2s ease-out ${i * 0.04}s both` }}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ background: "var(--color-dark-card)", color: "var(--color-primary)" }}>
                      <Music size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>{song}</p>
                      <p className="mt-0.5 truncate text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                        Requested by <span style={{ color: isMe ? "var(--color-primary)" : "var(--color-text-secondary)" }}>{participant?.name ?? "Unknown"}</span>
                      </p>
                    </div>
                    <span className="text-[10px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>#{i + 1}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="px-4 pb-3 text-center text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            The queue is empty. Add a song to sing next.
          </p>
        )}

        <div className="shrink-0 px-3 pb-3 pt-1">
        {!isInQueueOrSinging ? (
          <button
            onClick={onRequestJoinQueue}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition-all hover:brightness-110 active:scale-[0.98]"
            style={{ fontFamily: "var(--font-display)", background: "color-mix(in srgb, var(--color-primary) 62%, white)", color: "#24153a" }}
          >
            <Plus size={14} />
            Add to Queue
          </button>
        ) : isSinging ? (
          <p
            className="text-center text-xs font-bold"
            style={{ color: "var(--color-primary)" }}
          >
            You&apos;re singing!
          </p>
        ) : (
          <button
            onClick={onLeaveQueue}
            className="w-full cursor-pointer rounded-lg border py-2.5 text-xs font-medium transition-all hover:brightness-110"
            style={{ fontFamily: "var(--font-display)", borderColor: "var(--color-dark-border)", color: "var(--color-text-muted)" }}
          >
            Leave Queue
          </button>
        )}
        </div>
      </section>}
    </div>
  );
}
