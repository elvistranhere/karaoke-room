"use client";

import { useState } from "react";
import { Mic, MicOff, Crown, HeadphoneOff, Volume2, VolumeX } from "lucide-react";
import type { ParticipantStatus, RoomState } from "~/types/room";
import { DEFAULT_PERSON_MIX, personMixKey, type PersonMix, type PersonMixKey } from "~/lib/volumeModel";
import { DIVIDER } from "~/lib/surfaces";
import { VolumeSlider } from "./VolumeSlider";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

interface PeoplePanelProps {
  roomState: RoomState;
  myPeerId: string | null;
  participantStatus: Record<string, ParticipantStatus>;
  activeSpeakers: Set<string>;
  people: Record<string, PersonMix>;
  master: number;
  onPersonVolumeChange: (name: string, key: PersonMixKey, value: number) => void;
  onTogglePersonMute: (name: string) => void;
  onKick?: (peerId: string) => void;
  onTransferAdmin?: (peerId: string) => void;
  onRemoveFromQueue?: (peerId: string) => void;
}

export function PeoplePanel({
  roomState,
  myPeerId,
  participantStatus,
  activeSpeakers,
  people,
  master,
  onPersonVolumeChange,
  onTogglePersonMute,
  onKick,
  onTransferAdmin,
  onRemoveFromQueue,
}: PeoplePanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [kickTarget, setKickTarget] = useState<{ id: string; name: string } | null>(null);
  const isAdmin = myPeerId !== null && roomState.adminPeerId === myPeerId;

  const queuePositions = new Map(roomState.queue.map((id, i) => [id, i + 1]));
  const hasQueue = roomState.queue.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul className="min-h-0 flex-1 space-y-1 overflow-auto px-3 py-3">
        {roomState.participants.map((p) => {
          const isMe = p.id === myPeerId;
          const isSpeaking = Array.from(activeSpeakers).some((id) =>
            id.startsWith(`${p.name}-`) || id === p.name
          );
          const queuePos = queuePositions.get(p.id);
          const isSinger = p.id === roomState.currentSingerId;
          const status = participantStatus[p.id];
          const isExpanded = expandedId === p.id && !isMe;

          // Keyed by name so it survives reconnects, except for duplicate "Anonymous"
          const mixKeyId = personMixKey(p);
          const mix = people[mixKeyId] ?? DEFAULT_PERSON_MIX;
          const mixKey: PersonMixKey = isSinger ? "stage" : "talk";
          const personVol = mixKey === "stage" ? mix.stage : mix.talk;
          const personPercent = Math.round(personVol * 100);
          const outPercent = Math.round(personVol * master * 100);

          return (
            <li key={p.id}>
              <div
                onClick={() => !isMe && setExpandedId(isExpanded ? null : p.id)}
                className={`group/person flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-150 ${!isMe ? "row-clickable cursor-pointer" : ""}`}
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
                      <Crown size={12} className="shrink-0" style={{ color: "var(--color-accent)" }} aria-label="Host" />
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

                {/* Discord-style rightmost status glyphs: mic slash and deafen slash,
                    both when both apply. Local muting lives in the expanded volume panel. */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {hasQueue && queuePos && !isSinger ? (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                      style={{ background: "var(--color-primary-dim)", color: "var(--color-primary)" }}
                    >
                      #{queuePos}
                    </span>
                  ) : null}
                  {mix.muted && !isMe ? (
                    <VolumeX size={13} style={{ color: "var(--color-danger)" }} aria-label={`${p.name} is muted for you`} />
                  ) : null}
                  {status?.isMuted ? (
                    <MicOff size={13} style={{ color: "color-mix(in srgb, var(--color-danger) 60%, var(--color-text-muted))" }} aria-label={`${p.name} is muted`} />
                  ) : null}
                  {status?.isDeafened ? (
                    <HeadphoneOff size={13} style={{ color: "color-mix(in srgb, var(--color-danger) 60%, var(--color-text-muted))" }} aria-label={`${p.name} has sound off`} />
                  ) : null}
                </div>
              </div>


              {/* Per-person volume slider */}
              {isExpanded && (
                <div
                  className="mt-1 space-y-1.5 rounded-lg px-3 py-2 shadow-[var(--shadow-elevation-0)]"
                  style={{ background: "var(--color-dark-card)", animation: "fade-in 0.1s ease-out" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <VolumeSlider
                    label={isSinger ? "Stage" : "Volume"}
                    compact
                    value={personPercent}
                    ariaLabel={isSinger ? `Stage volume for ${p.name}` : `Volume for ${p.name}`}
                    onChange={(v) => onPersonVolumeChange(mixKeyId, mixKey, v / 100)}
                    trailing={
                      <button
                        onClick={() => onTogglePersonMute(mixKeyId)}
                        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md transition-all hover:brightness-125"
                        style={{
                          background: mix.muted ? "var(--color-danger-dim)" : "transparent",
                          color: mix.muted ? "var(--color-danger)" : "var(--color-text-muted)",
                        }}
                        title={mix.muted ? `Unmute ${p.name} for yourself` : `Mute ${p.name} for yourself`}
                        aria-label={mix.muted ? `Unmute ${p.name} for yourself` : `Mute ${p.name} for yourself`}
                      >
                        {mix.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                      </button>
                    }
                  />
                  <p className="text-[10px] leading-4" style={{ color: "var(--color-text-muted)" }}>
                    {mix.muted
                      ? "Muted for you. Unmuting restores this level."
                      : isSinger
                        ? "Their level while on stage. Kept apart from their talking level."
                        : "Their level while chatting. Kept apart from their stage level."}
                    {!mix.muted && master !== 1 ? ` ${personPercent}% -> ${outPercent}% out` : ""}
                  </p>
                  {isAdmin && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t pt-2" style={{ borderColor: DIVIDER }}>
                      <button
                        onClick={() => onTransferAdmin?.(p.id)}
                        className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium transition-colors hover:bg-[var(--color-primary-dim)]"
                        style={{ color: "var(--color-primary)" }}
                      >
                        <Crown size={12} />
                        Make host
                      </button>
                      {onRemoveFromQueue && queuePos ? (
                        <button
                          onClick={() => onRemoveFromQueue(p.id)}
                          className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium transition-colors hover:bg-white/5"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          Remove from queue
                        </button>
                      ) : null}
                      <button
                        onClick={() => setKickTarget({ id: p.id, name: p.name })}
                        className="ml-auto flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium transition-colors hover:bg-[var(--color-danger-dim)]"
                        style={{ color: "var(--color-danger)" }}
                      >
                        Kick
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {kickTarget && onKick ? (
        <KickConfirm
          name={kickTarget.name}
          onCancel={() => setKickTarget(null)}
          onConfirm={() => { onKick(kickTarget.id); setKickTarget(null); }}
        />
      ) : null}
    </div>
  );
}

function KickConfirm({
  name,
  onCancel,
  onConfirm,
}: {
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-display)" }}>Kick {name}?</DialogTitle>
          <DialogDescription>
            They leave the room right away, drop out of the queue, and cannot rejoin this room from that device.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" className="h-10" />}>Cancel</DialogClose>
          <Button variant="destructive" className="h-10 bg-[var(--color-danger)] text-white hover:brightness-110" onClick={onConfirm}>
            Kick
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
