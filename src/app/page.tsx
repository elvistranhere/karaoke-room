"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Users, Music, Lock, Search, Plus, LogIn, Eye, EyeOff } from "lucide-react";

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function generateRoomCode(): string {
  const array = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => CHARSET[b % CHARSET.length]).join("");
}

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [roomPassword, setRoomPassword] = useState("");
  const [showRoomPassword, setShowRoomPassword] = useState(false);
  const joinCodeClean = joinCode.toUpperCase().trim();
  const canJoin = joinCodeClean.length === CODE_LENGTH;

  const handleCreate = () => {
    const code = generateRoomCode();
    if (passwordEnabled && roomPassword.trim()) {
      sessionStorage.setItem(`room-password-${code}`, roomPassword.trim());
    }
    router.push(`/room/${code}`);
  };

  const handleJoin = () => {
    const code = joinCodeClean;
    if (code.length !== CODE_LENGTH) { setError("Code must be 6 characters"); return; }
    router.push(`/room/${code}`);
  };

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* Background */}
      <div className="pointer-events-none absolute -top-60 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full opacity-[0.06] blur-[120px]" style={{ background: "var(--color-primary)" }} />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 h-[300px] w-[400px] rounded-full opacity-[0.04] blur-[100px]" style={{ background: "var(--color-accent)" }} />

      {/* Logo */}
      <div className="mb-8" style={{ animation: "fade-in 0.5s ease-out" }}>
        <h1
          className="text-center text-5xl font-extrabold tracking-tight sm:text-6xl"
          style={{
            fontFamily: "var(--font-display)",
            background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Karaoke Now
        </h1>
        <p className="mt-2 text-center text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Sing together, anywhere. No signup needed.
        </p>
      </div>

      {/* Features row */}
      <div className="mb-8 flex gap-6" style={{ animation: "fade-in 0.6s ease-out 0.1s both" }}>
        {[
          { icon: <Mic size={16} />, text: "Voice effects" },
          { icon: <Music size={16} />, text: "Share music" },
          { icon: <Users size={16} />, text: "Sing together" },
        ].map((f, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
            <span style={{ color: "var(--color-primary)" }}>{f.icon}</span>
            {f.text}
          </div>
        ))}
      </div>

      {/* Entry actions */}
      <div
        className="grid w-full max-w-2xl gap-3 sm:grid-cols-2 sm:gap-4"
        style={{
          animation: "fade-in 0.7s ease-out 0.2s both",
        }}
      >
        <section
          className="group flex min-h-[280px] flex-col rounded-2xl border p-5 transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_45%,var(--color-dark-border))] sm:p-6"
          style={{ background: "linear-gradient(145deg, color-mix(in srgb, var(--color-dark-surface) 96%, var(--color-primary)), var(--color-dark-surface))", borderColor: "var(--color-dark-border)" }}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "color-mix(in srgb, var(--color-primary) 14%, transparent)", color: "var(--color-primary)" }}>
              <Plus size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
                Create a room
              </h2>
              <p className="mt-0.5 text-xs leading-5" style={{ color: "var(--color-text-muted)" }}>
                Start a session and invite your friends.
              </p>
            </div>
          </div>

          <div className="mt-7 flex h-5 items-center justify-between gap-3">
            <label htmlFor="room-password" className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>Room password</label>
            <button
              type="button"
              role="switch"
              aria-checked={passwordEnabled}
              aria-controls="room-password-field"
              onClick={() => {
                setPasswordEnabled((enabled) => {
                  if (enabled) {
                    setRoomPassword("");
                    setShowRoomPassword(false);
                  }
                  return !enabled;
                });
              }}
              className="flex cursor-pointer items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-dark-surface)]"
            >
              <span className="text-[10px] font-medium" style={{ color: passwordEnabled ? "var(--color-primary)" : "var(--color-text-muted)" }}>Required</span>
              <span
                aria-hidden="true"
                className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200"
                style={{ background: passwordEnabled ? "var(--color-primary)" : "var(--color-dark-border)" }}
              >
                <span className={`block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${passwordEnabled ? "translate-x-4" : "translate-x-0"}`} />
              </span>
            </button>
          </div>
          <div id="room-password-field" className="relative mt-2">
            <Lock
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors"
              style={{ color: passwordEnabled ? "var(--color-primary)" : "var(--color-text-muted)" }}
            />
            <input
              id="room-password"
              type={showRoomPassword ? "text" : "password"}
              value={roomPassword}
              onChange={(e) => setRoomPassword(e.target.value)}
              placeholder={passwordEnabled ? "Enter a room password" : "No password required"}
              disabled={!passwordEnabled}
              autoComplete="new-password"
              className="h-[58px] w-full rounded-xl border pl-10 pr-11 text-sm outline-none transition-all placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] disabled:cursor-default disabled:opacity-60"
              style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
            />
            {passwordEnabled && (
                  <button
                    type="button"
                    onClick={() => setShowRoomPassword((show) => !show)}
                    aria-label={showRoomPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-xl outline-none transition-colors hover:text-[var(--color-text-secondary)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {showRoomPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
            )}
          </div>

          <button
            onClick={handleCreate}
            className="mt-auto flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition-all hover:brightness-110 active:scale-[0.98]"
            style={{ fontFamily: "var(--font-display)", background: "var(--color-primary)", color: "#fff" }}
          >
            Create room
          </button>
        </section>

        <section
          className="group flex min-h-[280px] flex-col rounded-2xl border p-5 transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_45%,var(--color-dark-border))] sm:p-6"
          style={{ background: "linear-gradient(145deg, color-mix(in srgb, var(--color-dark-surface) 96%, var(--color-primary)), var(--color-dark-surface))", borderColor: "var(--color-dark-border)" }}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "color-mix(in srgb, var(--color-accent) 14%, transparent)", color: "var(--color-accent)" }}>
              <LogIn size={17} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
                Join a room
              </h2>
              <p className="mt-0.5 text-xs leading-5" style={{ color: "var(--color-text-muted)" }}>
                Enter the code shared by your host.
              </p>
            </div>
          </div>

          <label htmlFor="room-code" className="mt-7 flex h-5 items-center text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>Room code</label>
          <input
            id="room-code"
            type="text"
            value={joinCode}
            onChange={(e) => { setJoinCode(e.target.value.toUpperCase().slice(0, CODE_LENGTH)); setError(""); }}
            placeholder="XXXXXX"
            maxLength={CODE_LENGTH}
            autoComplete="off"
            className="mt-2 h-[58px] w-full rounded-xl border px-3 text-center font-mono text-lg font-bold uppercase tracking-[0.3em] outline-none transition-all placeholder:opacity-30 focus:border-[var(--color-primary)]"
            style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
            onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
          />
          {error && (
            <p className="mt-2 text-xs" role="alert" style={{ color: "var(--color-danger)" }}>{error}</p>
          )}

          <button
            onClick={handleJoin}
            disabled={!canJoin}
            className="mt-auto flex w-full items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-bold transition-all enabled:cursor-pointer enabled:hover:border-[var(--color-primary)] enabled:hover:brightness-110 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ fontFamily: "var(--font-display)", background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
          >
            Join
          </button>
        </section>
      </div>

      {/* Browse link */}
      <button
        onClick={() => router.push("/browse")}
        className="mt-7 flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-all hover:border-[var(--color-primary)] hover:brightness-125"
        style={{ background: "var(--color-dark-surface)", borderColor: "var(--color-dark-border)", color: "color-mix(in srgb, var(--color-primary) 65%, white)", fontFamily: "var(--font-display)" }}
      >
        <Search size={14} />
        Browse Public Rooms
      </button>

      {/* Footer */}
      <p className="mt-4 text-center text-[11px]" style={{ color: "var(--color-text-muted)" }}>
        Works on every browser, desktop and mobile. Paste a YouTube link and sing.
      </p>
    </main>
  );
}
