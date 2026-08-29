"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mic, Users, Music, Lock, Search, Plus, LogIn, Eye, EyeOff, ChevronDown } from "lucide-react";
import { SURFACE_LIFT } from "~/lib/surfaces";
import { track } from "~/lib/analytics";
import { writeSessionPref } from "~/lib/prefs";
import { VietBrosSignature } from "~/components/VietBrosSignature";

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_ROOM_NAME_LENGTH = 30; // must match MAX_ROOM_NAME_LENGTH in party/index.ts

const FAQS = [
  {
    question: "What is Karaoke Now?",
    answer:
      "Karaoke Now turns any browser into a shared karaoke room. Create a room, invite your friends with a six-character code and start singing together in seconds.",
  },
  {
    question: "How does an online karaoke room work?",
    answer:
      "The host creates a room and shares its code. Once everyone joins, add a YouTube karaoke track to the queue, choose who is on stage and Karaoke Now keeps playback lined up for the whole room.",
  },
  {
    question: "Is Karaoke Now free?",
    answer:
      "Yes. Karaoke Now is free to use, with no account to create and no app to install.",
  },
  {
    question: "Will everyone hear the music at the same time?",
    answer:
      "Yes. Whoever is on stage drives playback and every other browser follows, so the YouTube backing track stays synchronized across the room.",
  },
  {
    question: "Can we hear one another?",
    answer:
      "Yes. Live voice chat sends your microphone to the room in real time, and singers can add hall, echo, warmth and chorus effects while they perform.",
  },
  {
    question: "Are karaoke rooms private?",
    answer:
      "Rooms are private by default and can only be reached with their code. You can also add a password, or choose to list a room publicly in Browse.",
  },
  {
    question: "Can I use Karaoke Now on my phone?",
    answer:
      "Yes. Karaoke Now works in modern browsers on phones, tablets and computers, so everyone can join without downloading anything.",
  },
];

type TabId = "create" | "join";

const TABS: { id: TabId; label: string; icon: React.ReactNode; tint: string }[] = [
  { id: "create", label: "Create a room", icon: <Plus size={16} />, tint: "var(--color-primary)" },
  { id: "join", label: "Join a room", icon: <LogIn size={16} />, tint: "var(--color-accent)" },
];

const FIELD =
  "transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:shadow-[0_0_0_3px_var(--color-primary-dim)]";

const OPTION_ROW_BG = "color-mix(in srgb, var(--color-dark-bg) 45%, transparent)";

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200"
      style={{ background: on ? "var(--color-primary)" : "var(--color-dark-border)" }}
    >
      <span className={`block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${on ? "translate-x-4" : "translate-x-0"}`} />
    </span>
  );
}

function generateRoomCode(): string {
  const array = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => CHARSET[b % CHARSET.length]).join("");
}

export function HomeClient() {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("create");
  const [codeFocused, setCodeFocused] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [bodyHeight, setBodyHeight] = useState<number | undefined>(undefined);
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ create: null, join: null });
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [roomPassword, setRoomPassword] = useState("");
  const [showRoomPassword, setShowRoomPassword] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [showInBrowse, setShowInBrowse] = useState(false);
  const [openFaqs, setOpenFaqs] = useState<Set<number>>(() => new Set([0]));
  const joinCodeClean = joinCode.toUpperCase().trim();
  const canJoin = joinCodeClean.length === CODE_LENGTH;

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setBodyHeight(el.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleTabKeys = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next: TabId = tab === "create" ? "join" : "create";
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const handleCreate = () => {
    const code = generateRoomCode();
    track("room_created");
    // Read once by the room view, which is where the join itself is observed. Same
    // sessionStorage convention as the name, password and listing handoff below, and the
    // same guarded writer: a browser that blocks storage still gets its room.
    writeSessionPref(`room-creator-${code}`, "1");
    if (passwordEnabled && roomPassword.trim()) {
      writeSessionPref(`room-password-${code}`, roomPassword.trim());
    }
    if (roomName.trim()) {
      writeSessionPref(`room-name-${code}`, roomName.trim());
    }
    if (showInBrowse) {
      writeSessionPref(`room-public-${code}`, "1");
    }
    router.push(`/room/${code}`);
  };

  const handleJoin = () => {
    const code = joinCodeClean;
    if (code.length !== CODE_LENGTH) { setError("Code must be 6 characters"); return; }
    router.push(`/room/${code}`);
  };

  const handleFaqPrompt = () => {
    const faq = document.getElementById("faq");
    if (!faq) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    faq.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    window.history.pushState(null, "", "#faq");
  };

  const toggleFaq = (index: number) => {
    setOpenFaqs((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <main className="relative flex flex-col items-center overflow-hidden">
      {/* Glows anchor to the fold, not to the whole scrolling page. */}
      <div className="relative flex min-h-dvh w-full flex-col items-center justify-center pb-[max(env(safe-area-inset-bottom),2.5rem)] pl-[max(env(safe-area-inset-left),1rem)] pr-[max(env(safe-area-inset-right),1rem)] pt-[max(env(safe-area-inset-top),2.5rem)]">
      <div
        className="atmo-mesh pointer-events-none absolute inset-x-0 -bottom-32 top-0"
        aria-hidden="true"
        style={{
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0%, black calc(100% - 12rem), transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, black 0%, black calc(100% - 12rem), transparent 100%)",
        }}
      />
      {/* Logo */}
      <div className="mb-5" style={{ animation: "fade-in 0.5s ease-out" }}>
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
      <div className="mb-5 flex gap-6" style={{ animation: "fade-in 0.6s ease-out 0.1s both" }}>
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
        className="atmo-glass w-full max-w-md rounded-2xl p-2 shadow-[var(--shadow-elevation-2)]"
        style={{ animation: "fade-in 0.7s ease-out 0.2s both" }}
      >
        {/* Recessed tray, floated as an inset row rather than a full-bleed band. */}
        <div
          role="tablist"
          aria-label="Create or join a room"
          className="grid grid-cols-2 gap-1 rounded-lg p-1 shadow-[var(--shadow-control)]"
          style={{ background: "color-mix(in srgb, var(--color-dark-bg) 62%, transparent)" }}
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                ref={(el) => { tabRefs.current[t.id] = el; }}
                aria-selected={active}
                aria-controls={`panel-${t.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={handleTabKeys}
                className="relative flex min-h-11 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-md pt-0.5 text-[13px] font-bold tracking-wide outline-none transition-[background-color,color,box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                style={{
                  fontFamily: "var(--font-display)",
                  background: active ? "var(--color-dark-card)" : "transparent",
                  color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  boxShadow: active ? "var(--shadow-elevation-1)" : "none",
                }}
              >
                {/* Light spilling onto the lifted tab, the one place the atmosphere hue touches chrome. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-4 top-0 h-px transition-opacity duration-200"
                  style={{
                    opacity: active ? 1 : 0,
                    background: `linear-gradient(90deg, transparent, ${t.tint}, transparent)`,
                  }}
                />
                <span className="transition-colors duration-200" style={{ color: active ? t.tint : "inherit" }}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* One height animator serves both the tab swap and the password reveal, so the card
            never jumps and neither change needs its own transition. */}
        <div className="pt-4">
          <div
            className="overflow-hidden transition-[height] duration-[260ms] ease-out motion-reduce:transition-none"
            style={{ height: bodyHeight }}
          >
            <div ref={bodyRef} className="px-2 pb-2 sm:px-3 sm:pb-3">
          {tab === "create" ? (
            <div
              key="create"
              id="panel-create"
              role="tabpanel"
              aria-labelledby="tab-create"
              className="flex flex-col"
              style={{ animation: "fade-in 0.22s ease-out" }}
            >
              <p className="text-xs leading-5" style={{ color: "var(--color-text-muted)" }}>
                Start a session and invite your friends.
              </p>

              <label htmlFor="room-name" className="mt-5 flex h-5 items-center text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
                Room name <span className="ml-1" style={{ color: "var(--color-text-muted)" }}>(optional)</span>
              </label>
              <input
                id="room-name"
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value.slice(0, MAX_ROOM_NAME_LENGTH))}
                placeholder="Friday night karaoke"
                autoComplete="off"
                className={`mt-2 h-12 w-full rounded-xl border px-3.5 text-sm outline-none ${FIELD}`}
                style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
              />

              <div className="mt-3 space-y-2">
                <div className="rounded-xl p-3" style={{ background: OPTION_ROW_BG }}>
                  <div className="flex items-center justify-between gap-3">
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
                      className="-my-2 flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-md py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-dark-surface)]"
                    >
                      <span className="text-[10px] font-medium tabular-nums" style={{ color: passwordEnabled ? "var(--color-primary-level)" : "var(--color-text-muted)" }}>
                        {passwordEnabled ? "Required" : "Off"}
                      </span>
                      <Toggle on={passwordEnabled} />
                    </button>
                  </div>
                  {passwordEnabled && (
                    <div id="room-password-field" className="relative mt-3" style={{ animation: "fade-in 0.2s ease-out" }}>
                        <Lock
                          size={15}
                          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
                          style={{ color: "var(--color-primary)" }}
                        />
                        <input
                          id="room-password"
                          type={showRoomPassword ? "text" : "password"}
                          value={roomPassword}
                          onChange={(e) => setRoomPassword(e.target.value)}
                          placeholder="Enter a room password"
                          autoComplete="new-password"
                          className={`h-11 w-full rounded-lg border pl-10 pr-11 text-sm outline-none ${FIELD}`}
                          style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowRoomPassword((show) => !show)}
                          aria-label={showRoomPassword ? "Hide password" : "Show password"}
                          tabIndex={passwordEnabled ? 0 : -1}
                          className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-lg outline-none transition-colors hover:text-[var(--color-text-secondary)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                        {showRoomPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl p-3" style={{ background: OPTION_ROW_BG }}>
                  <div className="min-w-0">
                    <p className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>Show in Browse</p>
                    <p className="mt-0.5 text-[10px] leading-4" style={{ color: "var(--color-text-muted)" }}>
                      Off means only people with the code can find it
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showInBrowse}
                    aria-label="Show this room in Browse"
                    onClick={() => setShowInBrowse((shown) => !shown)}
                    className="-my-2 flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-md py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-dark-surface)]"
                  >
                    <span className="text-[10px] font-medium" style={{ color: showInBrowse ? "var(--color-primary-level)" : "var(--color-text-muted)" }}>
                      {showInBrowse ? "Public" : "Private"}
                    </span>
                    <Toggle on={showInBrowse} />
                  </button>
                </div>
              </div>

              <div className="pt-5">
                <button
                  onClick={handleCreate}
                  className="flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl pt-0.5 text-sm font-bold transition-[filter,transform,box-shadow] duration-150 ease-out hover:brightness-110 active:scale-[0.98]"
                  style={{
                    fontFamily: "var(--font-display)",
                    background: "color-mix(in oklab, var(--color-primary) 86%, #000)",
                    color: "#fff",
                    boxShadow: "0 6px 22px color-mix(in oklab, var(--color-primary) 30%, transparent), var(--shadow-elevation-0)",
                  }}
                >
                  Create room
                </button>
              </div>
            </div>
          ) : (
            <div
              key="join"
              id="panel-join"
              role="tabpanel"
              aria-labelledby="tab-join"
              className="flex flex-col"
              style={{ animation: "fade-in 0.22s ease-out" }}
            >
              <p className="text-xs leading-5" style={{ color: "var(--color-text-muted)" }}>
                Enter the code shared by your host.
              </p>

              <label htmlFor="room-code" className="mt-5 flex h-5 items-center text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>Room code</label>
              {/* One real field carries typing, paste and the mobile keyboard; the slots are decoration
                  over it. The charset drops I, O, 0 and 1, so the display font can carry the code. */}
              <div className="relative mt-2">
                <input
                  id="room-code"
                  type="text"
                  value={joinCode}
                  onChange={(e) => { setJoinCode(e.target.value.toUpperCase().slice(0, CODE_LENGTH)); setError(""); }}
                  onFocus={() => setCodeFocused(true)}
                  onBlur={() => setCodeFocused(false)}
                  maxLength={CODE_LENGTH}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="absolute inset-0 z-10 h-full w-full cursor-text rounded-xl opacity-0 outline-none"
                  onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
                />
                <div aria-hidden="true" className="grid grid-cols-6 gap-2">
                  {Array.from({ length: CODE_LENGTH }, (_, i) => {
                    const char = joinCodeClean[i] ?? "";
                    const caret = codeFocused && i === Math.min(joinCodeClean.length, CODE_LENGTH - 1);
                    const edge = canJoin ? "var(--color-accent)" : caret ? "var(--color-primary)" : "var(--color-dark-border)";
                    return (
                      <div
                        key={i}
                        className="flex h-14 items-center justify-center rounded-lg border text-2xl font-bold tabular-nums transition-[border-color,box-shadow,color] duration-150 ease-out"
                        style={{
                          fontFamily: "var(--font-display)",
                          background: "var(--color-dark-card)",
                          borderColor: edge,
                          color: "var(--color-text-primary)",
                          boxShadow: caret && !canJoin ? "0 0 0 3px var(--color-primary-dim)" : "var(--shadow-elevation-0)",
                        }}
                      >
                        {char}
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="mt-2.5 text-[11px] leading-4" aria-live="polite" style={{ color: error ? "var(--color-danger)" : "var(--color-text-muted)" }}>
                {error || "Six letters and numbers, like ABC123."}
              </p>

              <div className="pt-5">
                <button
                  onClick={handleJoin}
                  disabled={!canJoin}
                  className="flex min-h-12 w-full items-center justify-center rounded-xl pt-0.5 text-sm font-bold transition-[filter,transform,box-shadow,background-color,color] duration-200 ease-out enabled:cursor-pointer enabled:hover:brightness-110 enabled:active:scale-[0.98] disabled:cursor-not-allowed"
                  style={{
                    fontFamily: "var(--font-display)",
                    background: canJoin ? "var(--color-accent)" : "var(--color-dark-card)",
                    color: canJoin ? "var(--color-dark-bg)" : "var(--color-text-muted)",
                    boxShadow: canJoin
                      ? "0 6px 22px color-mix(in oklab, var(--color-accent) 28%, transparent), var(--shadow-elevation-0)"
                      : "var(--shadow-elevation-0)",
                  }}
                >
                  Join room
                </button>
              </div>
            </div>
          )}
            </div>
          </div>
        </div>
      </div>

      {/* Browse link */}
      <Link
        href="/browse"
        className={`mt-3 flex min-h-10 cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold shadow-[var(--shadow-elevation-1)] ${SURFACE_LIFT}`}
        style={{ background: "var(--color-dark-surface)", color: "color-mix(in srgb, var(--color-primary) 65%, white)", fontFamily: "var(--font-display)" }}
      >
        <Search size={14} />
        Browse Public Rooms
      </Link>

      <button
        type="button"
        onClick={handleFaqPrompt}
        className="group absolute bottom-[max(env(safe-area-inset-bottom),0.625rem)] flex min-h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold outline-none transition-[color,transform] duration-200 hover:text-[var(--color-text-primary)] active:scale-95 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-display)" }}
      >
        What is Karaoke Now?
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="transition-transform duration-200 group-hover:translate-y-0.5"
          style={{ color: "var(--color-primary)" }}
        />
      </button>
      </div>

      <section
        id="faq"
        aria-labelledby="faq-heading"
        className="relative isolate flex min-h-dvh w-full scroll-mt-6 flex-col overflow-hidden pb-[max(env(safe-area-inset-bottom),3.5rem)] pl-[max(env(safe-area-inset-left),1rem)] pr-[max(env(safe-area-inset-right),1rem)] pt-10 sm:pt-14"
      >
        <div
          className="atmo-mesh pointer-events-none absolute inset-0 -z-10"
          aria-hidden="true"
          style={{
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 10rem)",
            maskImage: "linear-gradient(to bottom, transparent 0, black 10rem)",
          }}
        />
        <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <h2
          id="faq-heading"
          className="text-center text-2xl font-bold tracking-tight sm:text-3xl"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}
        >
          Frequently asked questions
        </h2>
        <div className="mt-7 space-y-3">
          {FAQS.map((item, index) => {
            const isOpen = openFaqs.has(index);
            const triggerId = `faq-trigger-${index}`;
            const panelId = `faq-panel-${index}`;

            return (
            <div
              key={item.question}
              className="group rounded-xl shadow-[var(--shadow-elevation-0)]"
              style={{ background: "var(--color-dark-surface)" }}
            >
              <button
                type="button"
                id={triggerId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggleFaq(index)}
                className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-4 rounded-xl px-4 py-3 text-left text-sm font-bold outline-none transition-colors duration-200 hover:bg-white/[0.025] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)] sm:px-5"
                style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}
              >
                {item.question}
                <ChevronDown
                  size={17}
                  aria-hidden="true"
                  className={`shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none ${isOpen ? "rotate-180" : "rotate-0"}`}
                  style={{ color: "var(--color-primary)" }}
                />
              </button>
              <div
                id={panelId}
                role="region"
                aria-labelledby={triggerId}
                aria-hidden={!isOpen}
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
              >
                <div className="overflow-hidden">
                  <p className="px-4 pb-4 pr-12 text-sm leading-6 sm:px-5 sm:pb-5 sm:pr-14" style={{ color: "var(--color-text-secondary)" }}>
                    {item.answer}
                  </p>
                </div>
              </div>
            </div>
            );
          })}
        </div>
        <p className="mt-7 text-center text-sm leading-6" style={{ color: "var(--color-text-secondary)" }}>
          Ready to sing? <Link href="/browse" className="font-semibold underline underline-offset-4" style={{ color: "var(--color-primary-soft)" }}>Browse public karaoke rooms</Link> and join one that is already live.
        </p>
        <footer
          className="mt-auto pt-10"
        >
          <VietBrosSignature />
        </footer>
        </div>
      </section>
    </main>
  );
}
