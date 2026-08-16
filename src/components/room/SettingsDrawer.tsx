"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { VolumeSlider, VOLUME_MAX } from "./VolumeSlider";

const MAX_ROOM_NAME_LENGTH = 30; // must match MAX_ROOM_NAME_LENGTH in party/index.ts

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

  useEffect(() => {
    if (!open || !focusRoomName) return;
    roomNameInputRef.current?.focus();
  }, [open, focusRoomName]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const masterPercent = Math.round(master * 100);

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
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l"
        style={{
          background: "var(--color-dark-bg)",
          borderColor: "var(--color-dark-border)",
          animation: "slide-in-right 0.2s ease-out",
        }}
      >
        <div className="flex items-center justify-between border-b px-5 pb-4 pt-[max(env(safe-area-inset-top),1rem)]" style={{ borderColor: "var(--color-dark-border)" }}>
          <h2
            className="text-lg font-medium"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}
          >
            Settings
          </h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="flex size-10 cursor-pointer items-center justify-center rounded-lg text-sm transition-all hover:bg-[var(--color-dark-card)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-auto p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
          {onRename ? (
            <section>
              <label htmlFor="display-name" className="mb-2 block text-sm font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
                Display name
              </label>
              <div className="flex gap-2">
                <input
                  id="display-name"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value.slice(0, 20))}
                  className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none transition-all focus:border-[var(--color-primary)]"
                  style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
                  onKeyDown={(e) => {
                    const trimmed = nameDraft.trim();
                    if (e.key === "Enter" && trimmed && trimmed !== displayName) onRename(trimmed);
                  }}
                />
                <button
                  onClick={() => {
                    const trimmed = nameDraft.trim();
                    if (trimmed && trimmed !== displayName) onRename(trimmed);
                  }}
                  disabled={!nameDraft.trim() || nameDraft.trim() === displayName}
                  className="rounded-lg px-3 text-xs font-semibold transition-all enabled:cursor-pointer enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: "var(--color-primary-dim)", color: "var(--color-primary)" }}
                >
                  Save
                </button>
              </div>
            </section>
          ) : null}

          {/* Output volume */}
          <div className={onRename ? "border-t pt-5" : ""} style={{ borderColor: "var(--color-dark-border)" }}>
            <label className="mb-2 block text-sm font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
              Output Volume
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
            <button
              onClick={onResetPeopleVolumes}
              className="mt-1 inline-flex min-h-10 cursor-pointer items-center py-2 text-[11px] font-medium underline-offset-2 transition-all hover:underline"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Reset all per-person volumes
            </button>
          </div>

          <section className="border-t pt-5" style={{ borderColor: "var(--color-dark-border)" }}>
            <h3 className="mb-3 text-sm font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
              Room
            </h3>

            <label htmlFor="room-name" className="mb-2 block text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
              Room name
            </label>
            {isAdmin && onSetRoomName ? (
              <>
                <div className="flex gap-2">
                  <input
                    id="room-name"
                    ref={roomNameInputRef}
                    value={roomNameDraft}
                    onChange={(e) => setRoomNameDraft(e.target.value.slice(0, MAX_ROOM_NAME_LENGTH))}
                    placeholder="Unnamed room"
                    className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none transition-all focus:border-[var(--color-primary)]"
                    style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
                    onKeyDown={(e) => { if (e.key === "Enter") saveRoomName(); }}
                  />
                  <button
                    onClick={saveRoomName}
                    disabled={roomNameDraft.trim() === (roomName ?? "")}
                    className="rounded-lg px-3 text-xs font-semibold transition-all enabled:cursor-pointer enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: "var(--color-primary-dim)", color: "var(--color-primary)" }}
                  >
                    Save
                  </button>
                </div>
                <p className="mt-1 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                  Shown in the room header and on browse cards. Leave empty to clear it.
                </p>
              </>
            ) : (
              <p className="text-sm" style={{ color: roomName ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
                {roomName || "Unnamed room"}
              </p>
            )}

            {isAdmin && onSetPublic ? (
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>Show in Browse</p>
                  <p className="mt-0.5 text-[10px] leading-4" style={{ color: "var(--color-text-muted)" }}>
                    Anyone can find and join this room from the browse page
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isPublic}
                  aria-label="Show this room in Browse"
                  onClick={() => onSetPublic(!isPublic)}
                  className="flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-md py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                >
                  <span className="text-[10px] font-medium" style={{ color: isPublic ? "var(--color-primary)" : "var(--color-text-muted)" }}>
                    {isPublic ? "Public" : "Private"}
                  </span>
                  <span
                    aria-hidden="true"
                    className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200"
                    style={{ background: isPublic ? "var(--color-primary)" : "var(--color-dark-border)" }}
                  >
                    <span className={`block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${isPublic ? "translate-x-4" : "translate-x-0"}`} />
                  </span>
                </button>
              </div>
            ) : null}
          </section>

          {isAdmin && onSetPassword ? (
            <section className="border-t pt-5" style={{ borderColor: "var(--color-dark-border)" }}>
              <div className="mb-1 flex items-center gap-2">
                {isLocked
                  ? <Lock size={15} style={{ color: "var(--color-primary)" }} />
                  : <LockOpen size={15} style={{ color: "var(--color-text-muted)" }} />}
                <h3 className="text-sm font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
                  Room password
                </h3>
              </div>
              <p className="mb-4 text-[11px] leading-4" style={{ color: "var(--color-text-muted)" }}>
                Only you, the room admin, can manage this setting.
              </p>

              <div
                className="mb-4 flex items-center gap-3 rounded-xl border p-3"
                style={{
                  background: isLocked ? "var(--color-primary-dim)" : "var(--color-dark-surface)",
                  borderColor: isLocked ? "color-mix(in srgb, var(--color-primary) 35%, var(--color-dark-border))" : "var(--color-dark-border)",
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
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-all focus:border-[var(--color-primary)]"
                style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
                onKeyDown={(e) => { if (e.key === "Enter") savePassword(); }}
              />

              <button
                onClick={savePassword}
                disabled={!password.trim()}
                className="mt-3 w-full rounded-lg py-2.5 text-xs font-bold transition-all enabled:cursor-pointer enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ fontFamily: "var(--font-display)", background: "var(--color-primary)", color: "#fff" }}
              >
                {isLocked ? "Change password" : "Set password"}
              </button>

              {isLocked ? (
                <button
                  onClick={removePassword}
                  className="mt-2 w-full cursor-pointer rounded-lg border py-2.5 text-xs font-medium transition-all hover:brightness-110"
                  style={{ fontFamily: "var(--font-display)", background: "var(--color-danger-dim)", borderColor: "color-mix(in srgb, var(--color-danger) 35%, transparent)", color: "var(--color-danger)" }}
                >
                  Remove password protection
                </button>
              ) : null}
            </section>
          ) : null}

          <div className="rounded-lg p-4 text-center" style={{ background: "var(--color-dark-surface)" }}>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              Mic settings, voice effects, and device selection are in
            </p>
            <p className="mt-1 text-xs font-bold" style={{ color: "var(--color-primary)" }}>
              Sound Profile
            </p>
            <p className="mt-0.5 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
              (click the Talk/Sing button in the toolbar)
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
