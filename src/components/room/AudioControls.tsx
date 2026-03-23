"use client";

interface AudioControlsProps {
  isMuted: boolean;
  toggleMute: () => void;
  startMic: () => Promise<void>;
  stopMic: () => void;
  micStream: MediaStream | null;
  micError: string | null;
}

export function AudioControls({
  isMuted,
  toggleMute,
  startMic,
  stopMic,
  micStream,
  micError,
}: AudioControlsProps) {
  const hasMic = micStream !== null;

  return (
    <div
      className="rounded-2xl border p-5"
      style={{
        background: "var(--color-dark-surface)",
        borderColor: "var(--color-dark-border)",
      }}
    >
      <h3
        className="mb-4 text-sm uppercase tracking-widest"
        style={{
          fontFamily: "var(--font-display)",
          color: "var(--color-neon-cyan)",
          fontSize: "0.75rem",
        }}
      >
        Microphone
      </h3>

      {micError && (
        <p
          className="mb-3 text-sm"
          style={{ color: "var(--color-neon-pink)" }}
        >
          {micError}
        </p>
      )}

      <div className="flex items-center gap-3">
        {!hasMic ? (
          <button
            onClick={startMic}
            className="flex cursor-pointer items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold tracking-wide transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              fontFamily: "var(--font-display)",
              background: "var(--color-neon-cyan)",
              color: "var(--color-dark-bg)",
            }}
          >
            <MicIcon />
            Connect Mic
          </button>
        ) : (
          <>
            <button
              onClick={toggleMute}
              className="flex cursor-pointer items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold tracking-wide transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                fontFamily: "var(--font-display)",
                background: isMuted
                  ? "rgba(255, 45, 120, 0.15)"
                  : "rgba(0, 240, 255, 0.15)",
                color: isMuted
                  ? "var(--color-neon-pink)"
                  : "var(--color-neon-cyan)",
                borderWidth: "1px",
                borderColor: isMuted
                  ? "var(--color-neon-pink)"
                  : "var(--color-neon-cyan)",
              }}
            >
              {isMuted ? <MicOffIcon /> : <MicIcon />}
              {isMuted ? "Unmute" : "Mute"}
            </button>
            <button
              onClick={stopMic}
              className="cursor-pointer rounded-xl border px-4 py-3 text-sm transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                borderColor: "var(--color-dark-border)",
                color: "var(--color-text-secondary)",
              }}
            >
              Disconnect
            </button>
          </>
        )}
      </div>

      <p
        className="mt-3 text-xs"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {hasMic
          ? isMuted
            ? "Your mic is muted. Others can't hear you."
            : "Your mic is on. Others can hear you talking."
          : "Connect your mic to chat with the room."}
      </p>
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
