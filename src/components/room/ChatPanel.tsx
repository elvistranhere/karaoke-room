"use client";

import { useEffect, useRef, useState } from "react";
import { Crown, Mic, Wrench } from "lucide-react";
import type { ChatMessage } from "~/types/room";
import { REACTION_EMOJIS } from "~/lib/reactions";
import { chatNameColor } from "~/lib/chatColors";

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  myPeerId: string | null;
  adminPeerId?: string | null;
  currentSingerId?: string | null;
  onReact?: (emoji: string) => void;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

export function ChatPanel({ messages, onSend, myPeerId, adminPeerId = null, currentSingerId = null, onReact }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reactionCooldownRef = useRef(false);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput("");
  };

  const handleReact = (emoji: string) => {
    if (!onReact || reactionCooldownRef.current) return;
    reactionCooldownRef.current = true;
    onReact(emoji);
    setTimeout(() => { reactionCooldownRef.current = false; }, 500);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Messages */}
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-dark-border) transparent" }}
      >
        {messages.length === 0 ? (
          <p
            className="py-8 text-center text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            No messages yet. Say hi!
          </p>
        ) : (
          <div className="space-y-2.5">
            {messages.map((msg, i) => {
              const isMe = msg.from === myPeerId;
              if (msg.from === "system") {
                return (
                  <div key={`${msg.timestamp}-${i}`} className="flex items-start gap-2 rounded-lg px-2 py-1.5" style={{ background: "color-mix(in srgb, var(--color-dark-card) 55%, transparent)" }}>
                    <Wrench size={11} className="mt-0.5 shrink-0" style={{ color: "var(--color-text-muted)" }} aria-label="System message" />
                    <p className="min-w-0 flex-1 text-[11px] leading-4 break-words" style={{ color: "var(--color-text-secondary)" }}>{msg.text}</p>
                    <span className="shrink-0 text-[9px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>{formatTime(msg.timestamp)}</span>
                  </div>
                );
              }
              const isAdminMsg = adminPeerId !== null && msg.from === adminPeerId;
              const isSingerMsg = currentSingerId !== null && msg.from === currentSingerId;
              return (
                <div key={`${msg.timestamp}-${i}`} className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="shrink-0 text-[10px] tabular-nums"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {formatTime(msg.timestamp)}
                    </span>
                    <span
                      className="flex min-w-0 items-center gap-1 text-xs font-semibold"
                      style={{ color: isMe ? "var(--color-primary)" : chatNameColor(msg.from) }}
                    >
                      {isAdminMsg && <Crown size={10} className="shrink-0" style={{ color: "var(--color-accent)" }} aria-label="Host" />}
                      {isSingerMsg && <Mic size={10} className="shrink-0" style={{ color: "var(--color-primary)" }} aria-label="On stage" />}
                      <span className="truncate">{msg.fromName}</span>
                      {isMe && (
                        <span style={{ color: "var(--color-text-secondary)", fontWeight: 400 }}>
                          (you)
                        </span>
                      )}
                    </span>
                  </div>
                  <p
                    className="mt-0.5 text-sm break-words pl-[42px]"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {msg.text}
                  </p>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-1"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          maxLength={500}
          className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-[var(--color-primary)]"
          style={{
            borderColor: "var(--color-dark-border)",
            color: "var(--color-text-primary)",
          }}
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="cursor-pointer rounded-lg px-4 py-2 text-sm font-bold tracking-wide shadow-[var(--shadow-elevation-0)] transition-[transform,background-color,color] duration-200 hover:scale-105 active:scale-95 disabled:cursor-default disabled:opacity-40 disabled:hover:scale-100"
          style={{
            fontFamily: "var(--font-display)",
            background: input.trim()
              ? "color-mix(in srgb, var(--color-primary) 28%, transparent)"
              : "var(--color-dark-card)",
            color: input.trim()
              ? "var(--color-primary-bright)"
              : "var(--color-text-secondary)",
          }}
        >
          Send
        </button>
      </form>

      {onReact ? (
        <div
          className="mx-3 mb-3 flex shrink-0 items-center justify-around rounded-xl px-2 py-1.5 shadow-[var(--shadow-elevation-0)]"
          style={{ background: "color-mix(in srgb, var(--color-dark-card) 55%, transparent)" }}
          aria-label="Room reactions"
        >
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleReact(emoji)}
              className="cursor-pointer rounded-lg px-2 py-1 text-lg transition-all hover:scale-125 hover:bg-[var(--color-primary-dim)] active:scale-90"
              title={`React with ${emoji}`}
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
