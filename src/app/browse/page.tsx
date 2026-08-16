"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Users, Mic, Lock, ArrowLeft, RefreshCw } from "lucide-react";
import type { PublicRoomEntry } from "~/types/room";

const POLL_INTERVAL_MS = 10_000;

// Live rooms first, then the busiest, then alphabetical so the list is stable between polls
function sortRooms(a: PublicRoomEntry, b: PublicRoomEntry): number {
  const aLive = a.currentSinger ? 1 : 0;
  const bLive = b.currentSinger ? 1 : 0;
  if (aLive !== bLive) return bLive - aLive;
  if (a.participantCount !== b.participantCount) return b.participantCount - a.participantCount;
  return (a.name ?? a.code).localeCompare(b.name ?? b.code);
}

export default function BrowsePage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<PublicRoomEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    try {
      const host =
        process.env.NEXT_PUBLIC_PARTY_HOST ?? "localhost:1999";
      const protocol = host.startsWith("localhost") ? "http" : "https";
      const res = await fetch(
        `${protocol}://${host}/parties/registry/global`
      );
      if (!res.ok) throw new Error("Failed to fetch rooms");
      const data = (await res.json()) as PublicRoomEntry[];
      setRooms(data.filter((room) => room.participantCount > 0).sort(sortRooms));
      setError(null);
    } catch {
      setError("Could not load rooms");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRooms();
    const interval = setInterval(() => void fetchRooms(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  return (
    <main className="relative flex min-h-dvh flex-col items-center overflow-hidden pb-[max(env(safe-area-inset-bottom),2.5rem)] pl-[max(env(safe-area-inset-left),1rem)] pr-[max(env(safe-area-inset-right),1rem)] pt-[max(env(safe-area-inset-top),2.5rem)]">
      {/* Background */}
      <div
        className="pointer-events-none absolute -top-60 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full opacity-[0.06] blur-[120px]"
        style={{ background: "var(--color-primary)" }}
      />

      {/* Header */}
      <div className="mb-8 w-full max-w-2xl" style={{ animation: "fade-in 0.5s ease-out" }}>
        <button
          onClick={() => router.push("/")}
          className="mb-2 flex min-h-10 items-center gap-1.5 py-2 text-sm transition-colors hover:brightness-125"
          style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-display)" }}
        >
          <ArrowLeft size={14} />
          Back to Home
        </button>
        <div className="flex items-center justify-between">
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}
          >
            Public Rooms
          </h1>
          <button
            onClick={() => void fetchRooms()}
            className="flex min-h-10 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-all hover:border-[var(--color-primary)]"
            style={{
              borderColor: "var(--color-dark-border)",
              color: "var(--color-text-muted)",
              fontFamily: "var(--font-display)",
            }}
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="w-full max-w-2xl" style={{ animation: "fade-in 0.6s ease-out 0.1s both" }}>
        {loading && (
          <div className="flex justify-center py-20">
            <div
              className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }}
            />
          </div>
        )}

        {!loading && error && (
          <p className="py-20 text-center text-sm" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        )}

        {!loading && !error && rooms.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              No public rooms right now
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)", opacity: 0.6 }}>
              Create one and turn on Show in Browse to list it here
            </p>
          </div>
        )}

        {!loading && !error && rooms.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {rooms.map((room) => (
              <button
                key={room.code}
                onClick={() => router.push(`/room/${room.code}`)}
                className="flex flex-col gap-2 rounded-xl border p-4 text-left transition-all hover:border-[var(--color-primary)] hover:brightness-110 active:scale-[0.98]"
                style={{
                  background: "var(--color-dark-surface)",
                  borderColor: "var(--color-dark-border)",
                }}
              >
                {/* Top row: name + lock */}
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="min-w-0 truncate text-base font-bold"
                    style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}
                  >
                    {room.name || `Room ${room.code}`}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    {room.isLocked && (
                      <Lock size={14} style={{ color: "var(--color-accent)" }} />
                    )}
                    <Mic size={14} style={{ color: "var(--color-primary)" }} />
                  </div>
                </div>

                {/* Singer or video info */}
                {(room.currentSinger || room.currentSong) && (
                  <p
                    className="flex items-center gap-1.5 truncate text-xs"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {room.currentSinger && (
                      <span className="relative inline-flex h-1.5 w-1.5 shrink-0" aria-label="Live now">
                        <span
                          className="absolute inset-0 rounded-full"
                          style={{ background: "var(--color-success)", animation: "pulse-ring 1.6s ease-out infinite" }}
                        />
                        <span className="relative h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-success)" }} />
                      </span>
                    )}
                    <span className="truncate">
                      {room.currentSinger && (
                        <span style={{ color: "var(--color-accent)" }}>
                          {room.currentSinger}
                        </span>
                      )}
                      {room.currentSinger && room.currentSong && " - "}
                      {room.currentSong}
                    </span>
                  </p>
                )}

                {/* Bottom: code chip + participant count */}
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                  <span
                    className="rounded-md px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em]"
                    style={{ background: "var(--color-dark-card)", color: "var(--color-text-secondary)" }}
                  >
                    {room.code}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users size={12} />
                    {room.participantCount} {room.participantCount === 1 ? "person" : "people"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
