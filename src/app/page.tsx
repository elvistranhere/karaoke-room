"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Users, Music, Lock, Search, Plus, LogIn } from "lucide-react";

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
          KaraOK
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

          <div className="mt-7 rounded-xl border p-3" style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)" }}>
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={passwordEnabled}
                onChange={(e) => { setPasswordEnabled(e.target.checked); if (!e.target.checked) setRoomPassword(""); }}
                className="accent-[var(--color-primary)]"
              />
              <Lock size={14} style={{ color: "var(--color-text-muted)" }} />
              <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>Require a password</span>
            </label>
            {passwordEnabled && (
              <input
                aria-label="Room password"
                type="password"
                value={roomPassword}
                onChange={(e) => setRoomPassword(e.target.value)}
                placeholder="Room password"
                className="mt-3 w-full rounded-lg border px-3 py-2 text-sm outline-none transition-all focus:border-[var(--color-primary)]"
                style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
              />
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

          <label htmlFor="room-code" className="mt-7 text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>Room code</label>
          <input
            id="room-code"
            type="text"
            value={joinCode}
            onChange={(e) => { setJoinCode(e.target.value.toUpperCase().slice(0, CODE_LENGTH)); setError(""); }}
            placeholder="XXXXXX"
            maxLength={CODE_LENGTH}
            autoComplete="off"
            className="mt-2 w-full rounded-xl border px-3 py-3.5 text-center font-mono text-lg font-bold uppercase tracking-[0.3em] outline-none transition-all placeholder:opacity-30 focus:border-[var(--color-primary)]"
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
        Works on all browsers. Singing requires Chromium (Chrome, Edge, Brave, Arc).
      </p>
    </main>
  );
}
