"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Crown, Mic, Wrench } from "lucide-react";
import type { ChatMessage } from "~/types/room";
import { REACTION_EMOJIS } from "~/lib/reactions";
import { chatNameColor } from "~/lib/chatColors";

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  myPeerId: string | null;
  adminPeerId?: string | null;
  currentSingerId?: string | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onReact?: (emoji: string) => void;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

export function ChatPanel({ messages, onSend, myPeerId, adminPeerId = null, currentSingerId = null, collapsed, onToggleCollapse, onReact }: ChatPanelProps) {
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
    <div
      className="flex h-full flex-col rounded-2xl border"
      style={{
        background: "var(--color-dark-surface)",
        borderColor: "var(--color-dark-border)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-4 py-4"
        style={{ borderColor: "var(--color-dark-border)" }}
      >
        <h3
          className="text-base font-medium"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--color-text-primary)",
          }}
        >
          Room chat
        </h3>
        <div className="flex items-center gap-2">
          {onToggleCollapse ? (
            <button
              onClick={onToggleCollapse}
              className="cursor-pointer inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-all hover:scale-105 active:scale-95"
              style={{
                fontFamily: "var(--font-display)",
                borderColor: "var(--color-dark-border)",
                color: "var(--color-text-muted)",
                background: "var(--color-dark-card)",
              }}
              title={collapsed ? "Expand chat" : "Collapse chat"}
            >
              {collapsed ? <><ChevronUp size={11} />Show</> : <><ChevronDown size={11} />Hide</>}
            </button>
          ) : null}
        </div>
      </div>

      {/* Last message preview when collapsed */}
      {collapsed && messages.length > 0 ? (() => {
        const last = messages[messages.length - 1]!;
        const isMe = last.from === myPeerId;
        return (
          <div className="flex items-baseline gap-2 truncate px-5 py-2">
            <span className="shrink-0 text-[10px] tabular-nums" style={{ color: "var(--color-text-secondary)" }}>
              {formatTime(last.timestamp)}
            </span>
            <span className="text-xs font-semibold" style={{ color: isMe ? "var(--color-primary)" : chatNameColor(last.from) }}>
              {last.fromName}
            </span>
            <span className="truncate text-xs" style={{ color: "var(--color-text-muted)" }}>
              {last.text}
            </span>
          </div>
        );
      })() : null}

      {/* Messages */}
      <div
        ref={listRef}
        className={`overflow-y-auto px-4 py-3 transition-all duration-200 ${collapsed ? "hidden" : "flex-1"}`}
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
        className={`items-center gap-2 border-t px-4 py-3 ${collapsed ? "hidden" : "flex"}`}
        style={{ borderColor: "var(--color-dark-border)" }}
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
          className="cursor-pointer rounded-lg px-4 py-2 text-sm font-bold tracking-wide transition-all duration-200 hover:scale-105 active:scale-95 disabled:cursor-default disabled:opacity-40 disabled:hover:scale-100"
          style={{
            fontFamily: "var(--font-display)",
            background: input.trim()
              ? "var(--color-primary-dim)"
              : "var(--color-dark-card)",
            color: input.trim()
              ? "var(--color-primary)"
              : "var(--color-text-secondary)",
            borderWidth: "1px",
            borderColor: input.trim()
              ? "var(--color-primary)"
              : "var(--color-dark-border)",
          }}
        >
          Send
        </button>
      </form>

      {onReact && !collapsed ? (
        <div
          className="flex items-center justify-around border-t px-4 py-2.5"
          style={{ borderColor: "var(--color-dark-border)", background: "color-mix(in srgb, var(--color-dark-card) 45%, transparent)" }}
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
