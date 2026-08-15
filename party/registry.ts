import type * as Party from "partykit/server";

interface RoomEntry {
  name: string | null;
  participantCount: number;
  currentSinger: string | null;
  currentSong: string | null;
  isLocked: boolean;
  updatedAt: number;
}

const EXPIRY_MS = 2 * 60 * 1000; // 2 minutes
const MAX_ROOMS = 200;
const MAX_ROOM_NAME_LENGTH = 30; // must match MAX_ROOM_NAME_LENGTH in party/index.ts
const MAX_TEXT_LENGTH = 120;
const DEV_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/g;

function cleanText(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(CONTROL_CHARS_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
  return cleaned || null;
}

export default class Registry implements Party.Server {
  rooms: Map<string, RoomEntry> = new Map();

  constructor(readonly room: Party.Room) {}

  private purgeExpired() {
    const cutoff = Date.now() - EXPIRY_MS;
    for (const [code, entry] of this.rooms) {
      if (entry.updatedAt < cutoff) {
        this.rooms.delete(code);
      }
    }
  }

  // Writes are gated on a shared token. The only exemption is the local dev server,
  // where the var is normally unset: a deployed host with no REGISTRY_TOKEN rejects
  // every write rather than leaving the public listing open to anyone.
  private isAuthorized(req: Party.Request, url: URL): boolean {
    const token = this.room.env.REGISTRY_TOKEN;
    if (typeof token === "string" && token) {
      return req.headers.get("x-registry-token") === token;
    }
    if (DEV_HOSTNAMES.has(url.hostname)) return true;
    console.warn("[Registry] REGISTRY_TOKEN is not set - rejecting write");
    return false;
  }

  private evictStalestIfFull(roomCode: string) {
    if (this.rooms.has(roomCode) || this.rooms.size < MAX_ROOMS) return;
    let stalestCode: string | null = null;
    let stalestAt = Infinity;
    for (const [code, entry] of this.rooms) {
      if (entry.updatedAt < stalestAt) {
        stalestAt = entry.updatedAt;
        stalestCode = code;
      }
    }
    if (stalestCode !== null) this.rooms.delete(stalestCode);
  }

  async onRequest(req: Party.Request) {
    const url = new URL(req.url);
    const roomCode = url.searchParams.get("room");

    if (req.method === "GET") {
      this.purgeExpired();
      const list = Array.from(this.rooms.entries()).map(([code, entry]) => ({
        code,
        ...entry,
      }));
      return new Response(JSON.stringify(list), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (!this.isAuthorized(req, url)) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (req.method === "POST" && roomCode) {
      let body: Record<string, unknown>;
      try {
        const parsed: unknown = await req.json();
        if (parsed === null || typeof parsed !== "object") throw new Error("not an object");
        body = parsed as Record<string, unknown>;
      } catch {
        return new Response("Invalid body", { status: 400 });
      }
      const count = Number(body.participantCount);
      this.purgeExpired();
      this.evictStalestIfFull(roomCode);
      this.rooms.set(roomCode, {
        name: cleanText(body.name, MAX_ROOM_NAME_LENGTH),
        participantCount: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0,
        currentSinger: cleanText(body.currentSinger, MAX_TEXT_LENGTH),
        currentSong: cleanText(body.currentSong, MAX_TEXT_LENGTH),
        isLocked: body.isLocked === true,
        updatedAt: Date.now(),
      });
      return new Response("ok", { status: 200 });
    }

    if (req.method === "DELETE" && roomCode) {
      this.rooms.delete(roomCode);
      return new Response("ok", { status: 200 });
    }

    return new Response("Method not allowed", { status: 405 });
  }
}
