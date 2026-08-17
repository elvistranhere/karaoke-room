"use client";

import { useState } from "react";
import { Mic, MicOff, Crown, HeadphoneOff, Volume2, VolumeX } from "lucide-react";
import type { ParticipantStatus, RoomState } from "~/types/room";
import { DEFAULT_PERSON_MIX, personMixKey, type PersonMix } from "~/lib/volumeModel";
import { DIVIDER } from "~/lib/surfaces";
import { VolumeSlider } from "./VolumeSlider";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
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
  // The mixer fell back to its <audio> elements on an engine that ignores their
  // volume, so the row is mute-only until the graph is back
  volumeControlLost: boolean;
  onPersonVolumeChange: (name: string, value: number) => void;
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
  volumeControlLost,
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
          const personPercent = Math.round(mix.volume * 100);
          const outPercent = Math.round(mix.volume * master * 100);

          return (
            <li key={p.id}>
              <Popover open={isExpanded} onOpenChange={(open) => setExpandedId(open && !isMe ? p.id : null)}>
              <PopoverTrigger
                nativeButton={false}
                disabled={isMe}
                render={
              <div
                className={`group/person flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-all duration-150 ${!isMe ? "row-clickable cursor-pointer" : ""}`}
                onContextMenu={(e) => { if (!isMe) { e.preventDefault(); setExpandedId(isExpanded ? null : p.id); } }}
                style={{
                  background: isSpeaking
                    ? "color-mix(in srgb, var(--color-primary) 15%, transparent)"
                    : isSinger
                      ? "var(--color-primary-dim)"
                    : isMe
                      ? "color-mix(in srgb, var(--color-primary) 5%, transparent)"
                      : undefined,
                  boxShadow: isSpeaking
                    ? "inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 40%, transparent)"
                    : isSinger
                      ? "0 0 14px color-mix(in srgb, var(--color-primary) 18%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 35%, transparent)"
                    : isExpanded
                      ? "0 0 8px color-mix(in srgb, var(--color-primary) 30%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 20%, transparent)"
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
                        ? "color-mix(in srgb, var(--color-primary) 30%, transparent)"
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
                }
              />

              {/* Discord-style floating menu instead of an inline expansion */}
              <PopoverContent
                side="right"
                align="start"
                sideOffset={10}
                className="w-60 gap-0 rounded-xl border-none p-1.5"
                style={{ background: "var(--color-dark-card)", boxShadow: "var(--shadow-elevation-3)" }}
              >
                <div className="space-y-1.5 px-2 pb-2 pt-1.5">
                  {volumeControlLost ? (
                    <button
                      onClick={() => onTogglePersonMute(mixKeyId)}
                      className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-xs font-medium transition-colors hover:bg-white/5"
                      style={{ color: mix.muted ? "var(--color-danger)" : "var(--color-text-secondary)" }}
                      aria-label={mix.muted ? `Unmute ${p.name} for yourself` : `Mute ${p.name} for yourself`}
                    >
                      {mix.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                      {mix.muted ? `Unmute ${p.name}` : `Mute ${p.name}`}
                    </button>
                  ) : (
                    <VolumeSlider
                      label="Volume"
                      compact
                      value={personPercent}
                      ariaLabel={`Volume for ${p.name}`}
                      onChange={(v) => onPersonVolumeChange(mixKeyId, v / 100)}
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
                  )}
                  <p className="text-[10px] leading-4" style={{ color: "var(--color-text-muted)" }}>
                    {volumeControlLost
                      ? "This device is playing voices directly, so only mute works. Tap to bring the sound back to restore the sliders."
                      : mix.muted
                        ? "Muted for you. Unmuting restores this level."
                        : "Only changes what you hear."}
                    {!volumeControlLost && !mix.muted && master !== 1 ? ` ${personPercent}% -> ${outPercent}% out` : ""}
                  </p>
                </div>
                {isAdmin && (
                  <>
                    <div className="mx-1 border-t" style={{ borderColor: DIVIDER }} />
                    <div className="pt-1">
                      <button
                        onClick={() => { onTransferAdmin?.(p.id); setExpandedId(null); }}
                        className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-xs font-medium transition-colors hover:bg-[var(--color-primary-dim)]"
                        style={{ color: "var(--color-primary)" }}
                      >
                        <Crown size={12} />
                        Make host
                      </button>
                      {onRemoveFromQueue && queuePos ? (
                        <button
                          onClick={() => { onRemoveFromQueue(p.id); setExpandedId(null); }}
                          className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-xs font-medium transition-colors hover:bg-white/5"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          Remove from queue
                        </button>
                      ) : null}
                      <button
                        onClick={() => { setKickTarget({ id: p.id, name: p.name }); setExpandedId(null); }}
                        className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-xs font-medium transition-colors hover:bg-[var(--color-danger-dim)]"
                        style={{ color: "var(--color-danger)" }}
                      >
                        Kick
                      </button>
                    </div>
                  </>
                )}
              </PopoverContent>
              </Popover>
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
