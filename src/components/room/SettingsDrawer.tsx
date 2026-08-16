"use client";

import { useEffect, useRef, useState } from "react";
import { Crown, Lock, LockOpen } from "lucide-react";
import { VolumeSlider, VOLUME_MAX } from "./VolumeSlider";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";

const MAX_ROOM_NAME_LENGTH = 30; // must match MAX_ROOM_NAME_LENGTH in party/index.ts

const FIELD_CLASS =
  "min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const GROUP_LABEL_CLASS = "text-[10px] font-bold uppercase tracking-widest";

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  master: number;
  onMasterChange: (value: number) => void;
  onResetPeopleVolumes: () => void;
  displayName?: string;
  onRename?: (name: string) => void;
  isAdmin?: boolean;
  isLocked?: boolean;
  onSetPassword?: (password: string | null) => void;
  roomName?: string | null;
  onSetRoomName?: (name: string | null) => void;
  isPublic?: boolean;
  onSetPublic?: (isPublic: boolean) => void;
  focusRoomName?: boolean;
}

export function SettingsDrawer({
  open,
  onClose,
  master,
  onMasterChange,
  onResetPeopleVolumes,
  displayName = "",
  onRename,
  isAdmin = false,
  isLocked = false,
  onSetPassword,
  roomName = null,
  onSetRoomName,
  isPublic = false,
  onSetPublic,
  focusRoomName = false,
}: SettingsDrawerProps) {
  const [password, setPassword] = useState("");
  const [nameDraft, setNameDraft] = useState(displayName);
  const [roomNameDraft, setRoomNameDraft] = useState(roomName ?? "");
  const roomNameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setNameDraft(displayName);
    setRoomNameDraft(roomName ?? "");
  }, [open, isLocked, displayName, roomName]);

  const masterPercent = Math.round(master * 100);
  const showHostSettings = isAdmin && (!!onSetRoomName || !!onSetPublic || !!onSetPassword);

  const savePassword = () => {
    if (!onSetPassword) return;
    const trimmed = password.trim();
    if (!trimmed) return;
    onSetPassword(trimmed);
    setPassword("");
  };

  const saveRoomName = () => {
    if (!onSetRoomName) return;
    const trimmed = roomNameDraft.trim();
    if (trimmed === (roomName ?? "")) return;
    onSetRoomName(trimmed || null);
  };

  const removePassword = () => {
    if (!onSetPassword || !isLocked) return;
    onSetPassword(null);
    setPassword("");
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent
        side="right"
        className="max-sm:w-full! bg-background gap-0 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
        initialFocus={focusRoomName ? roomNameInputRef : undefined}
      >
        <SheetHeader className="border-b px-5 pb-4 pr-14 pt-[max(env(safe-area-inset-top),1rem)]">
          <SheetTitle className="text-lg" style={{ fontFamily: "var(--font-display)" }}>
            Settings
          </SheetTitle>
          <SheetDescription className="sr-only">
            Your display name, output volume, and room options.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-auto p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
          <section className="space-y-5">
            <h3 className={GROUP_LABEL_CLASS} style={{ fontFamily: "var(--font-display)", color: "var(--color-text-muted)" }}>
              Personal
            </h3>

            {onRename ? (
              <div>
                <label htmlFor="display-name" className="mb-2 block text-sm font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
                  Display name
                </label>
                <div className="flex gap-2">
                  <input
                    id="display-name"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value.slice(0, 20))}
                    className={FIELD_CLASS}
                    style={{ background: "var(--color-dark-card)", color: "var(--color-text-primary)" }}
                    onKeyDown={(e) => {
                      const trimmed = nameDraft.trim();
                      if (e.key === "Enter" && trimmed && trimmed !== displayName) onRename(trimmed);
                    }}
                  />
                  <Button
                    variant="secondary"
                    className="h-auto"
                    onClick={() => {
                      const trimmed = nameDraft.trim();
                      if (trimmed && trimmed !== displayName) onRename(trimmed);
                    }}
                    disabled={!nameDraft.trim() || nameDraft.trim() === displayName}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : null}

            <div>
              <label className="mb-2 block text-sm font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
                Output volume
              </label>
              <VolumeSlider
                label="Output"
                value={masterPercent}
                max={VOLUME_MAX}
                ariaLabel="Output volume"
                onChange={(v) => onMasterChange(v / 100)}
              />
              <p className="mt-2 text-[10px] leading-4" style={{ color: "var(--color-text-muted)" }}>
                Scales every voice you hear. Per-person volumes multiply on top. YouTube music is capped at 100%.
              </p>
              {masterPercent > 100 ? (
                <p className="mt-1 text-[10px] leading-4" style={{ color: "var(--color-accent)" }}>
                  Boost applies to voices only, so the music sits lower against them.
                </p>
              ) : null}
              <Button
                variant="link"
                onClick={onResetPeopleVolumes}
                className="mt-1 h-10 px-0 text-[11px] font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Reset all per-person volumes
              </Button>
            </div>
          </section>

          {showHostSettings ? (
            <section className="space-y-5 border-t pt-5">
              <div>
                <div className="flex items-center gap-1.5">
                  <Crown size={13} style={{ color: "var(--color-accent)" }} />
                  <h3 className={GROUP_LABEL_CLASS} style={{ fontFamily: "var(--font-display)", color: "var(--color-accent)" }}>
                    Host settings
                  </h3>
                </div>
                <p className="mt-1 text-[10px] leading-4" style={{ color: "var(--color-text-muted)" }}>
                  Only you, the room host, can change these.
                </p>
              </div>

              {onSetRoomName ? (
                <div>
                  <label htmlFor="room-name" className="mb-2 block text-sm font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
                    Room name
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="room-name"
                      ref={roomNameInputRef}
                      value={roomNameDraft}
                      onChange={(e) => setRoomNameDraft(e.target.value.slice(0, MAX_ROOM_NAME_LENGTH))}
                      placeholder="Unnamed room"
                      className={FIELD_CLASS}
                      style={{ background: "var(--color-dark-card)", color: "var(--color-text-primary)" }}
                      onKeyDown={(e) => { if (e.key === "Enter") saveRoomName(); }}
                    />
                    <Button
                      variant="secondary"
                      className="h-auto"
                      onClick={saveRoomName}
                      disabled={roomNameDraft.trim() === (roomName ?? "")}
                    >
                      Save
                    </Button>
                  </div>
                  <p className="mt-1 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                    Shown in the room header and on browse cards. Leave empty to clear it.
                  </p>
                </div>
              ) : null}

              {onSetPublic ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>Show in Browse</p>
                    <p className="mt-0.5 text-[10px] leading-4" style={{ color: "var(--color-text-muted)" }}>
                      Anyone can find and join this room from the browse page
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[10px] font-medium" style={{ color: isPublic ? "var(--color-primary)" : "var(--color-text-muted)" }}>
                      {isPublic ? "Public" : "Private"}
                    </span>
                    <Switch
                      checked={isPublic}
                      onCheckedChange={(checked) => onSetPublic(checked)}
                      aria-label="Show this room in Browse"
                    />
                  </div>
                </div>
              ) : null}

              {onSetPassword ? (
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    {isLocked
                      ? <Lock size={15} style={{ color: "var(--color-primary)" }} />
                      : <LockOpen size={15} style={{ color: "var(--color-text-muted)" }} />}
                    <h4 className="text-sm font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
                      Room password
                    </h4>
                  </div>

                  <div
                    className="mb-4 flex items-center gap-3 rounded-xl border p-3"
                    style={{
                      background: isLocked ? "var(--color-primary-dim)" : "var(--color-dark-surface)",
                      borderColor: isLocked ? "color-mix(in srgb, var(--color-primary) 35%, var(--color-dark-border))" : undefined,
                    }}
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: isLocked ? "var(--color-primary)" : "var(--color-dark-card)", color: isLocked ? "#fff" : "var(--color-text-muted)" }}
                    >
                      {isLocked ? <Lock size={14} /> : <LockOpen size={14} />}
                    </div>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
                        {isLocked ? "Password protected" : "No password required"}
                      </p>
                      <p className="mt-0.5 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                        {isLocked ? "Guests must enter it before joining." : "Anyone with the room code can join."}
                      </p>
                    </div>
                  </div>

                  <label htmlFor="room-password" className="mb-2 block text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
                    {isLocked ? "Change password" : "Create a password"}
                  </label>
                  <input
                    id="room-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isLocked ? "Enter a new password" : "Enter a password"}
                    className={`${FIELD_CLASS} w-full`}
                    style={{ background: "var(--color-dark-card)", color: "var(--color-text-primary)" }}
                    onKeyDown={(e) => { if (e.key === "Enter") savePassword(); }}
                  />

                  <Button
                    onClick={savePassword}
                    disabled={!password.trim()}
                    className="mt-3 h-10 w-full"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {isLocked ? "Change password" : "Set password"}
                  </Button>

                  {isLocked ? (
                    <Button
                      variant="destructive"
                      onClick={removePassword}
                      className="mt-2 h-10 w-full"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      Remove password protection
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="rounded-lg p-4 text-center" style={{ background: "var(--color-dark-surface)" }}>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              Mic check, voice effects, and device selection live in
            </p>
            <p className="mt-1 text-xs font-bold" style={{ color: "var(--color-primary)" }}>
              Sound Profile
            </p>
            <p className="mt-0.5 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
              (the Sound button in the toolbar)
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
