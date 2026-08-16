import type * as Party from "partykit/server";
import type { ChatMessage, ClientMessage, ParticipantStatus, RoomState, ServerMessage, VideoState } from "./types";

interface ParticipantEntry {
  name: string;
  ws: Party.Connection;
}

const MAX_CHAT_MESSAGES = 100;
const MAX_CHAT_LENGTH = 500;
const MAX_NAME_LENGTH = 20; // must match client-side MAX_NAME_LENGTH in src/lib/playerName.ts
const MAX_ROOM_NAME_LENGTH = 30; // must match MAX_ROOM_NAME_LENGTH in src/app/page.tsx
const MAX_BROWSER_LENGTH = 64;
const ALLOWED_EMOJIS = new Set(["🔥", "💯", "😢", "🎵", "❤️"]);
const HEARTBEAT_INTERVAL_MS = 15_000; // ping every 15s
const HEARTBEAT_TIMEOUT_MS = 40_000;  // evict after 40s of no pong
const SINGER_TIMEOUT_MS = 60_000;     // auto-advance queue after 60s of inactive singer
const VIDEO_STALL_MS = 10_000;        // pause the room if the singer stops sending video-sync (broadcast every 2s, buffering heartbeats included)
const ADMIN_GRACE_MS = 45_000;        // admin seat stays vacant this long so a refresh can reclaim it
const REGISTRY_KEEPALIVE_MS = 60_000; // re-report a quiet public room before its registry entry expires
const MAX_AUTH_FAILURES = 5;          // wrong-password attempts allowed per client
const AUTH_FAILURE_WINDOW_MS = 10 * 60_000; // failures decay after this, so honest typos are not a life sentence
const MAX_AUTH_FAILURE_KEYS = 200;    // failure counters kept per room, oldest evicted first
const MAX_BANNED_CLIENTS = 200;       // kick bans kept per room, oldest evicted first
// Durable Object storage keys. Only room identity is persisted: chat, queue and
// participants stay in memory by design.
const STORAGE_KEYS = {
  roomName: "roomName",
  isPublic: "isPublic",
  passwordHash: "passwordHash",
  adminClientId: "adminClientId",
  adminVacatedAt: "adminVacatedAt",
  bannedClientIds: "bannedClientIds",
} as const;
const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/g;

export default class KaraokeRoom implements Party.Server {
  participants: Map<string, ParticipantEntry> = new Map();
  queue: string[] = [];
  currentSingerId: string | null = null;
  chatMessages: ChatMessage[] = [];
  participantStatus: Map<string, ParticipantStatus> = new Map();
  mutedBySinger: string | null = null; // persisted so reconnecting clients get correct state
  videoState: VideoState | null = null; // current singer's synced YouTube video, null when nobody is on stage

  // Room identity & listing
  roomName: string | null = null;
  isPublic = false;

  // Admin & password
  adminPeerId: string | null = null;
  passwordHash: string | null = null;
  pendingAuth: Map<string, { name: string; ws: Party.Connection }> = new Map();

  // Admin succession: adminClientId is the localStorage identity of whoever holds the
  // crown, so a refresh can reclaim it while the seat is vacant. Never broadcast.
  private adminClientId: string | null = null;
  // When the seat went vacant. Persisted, because the grace timer does not survive an
  // empty room and something has to tell the next joiner the wait is over.
  private adminVacatedAt: number | null = null;
  private adminGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private clientIdByPeer: Map<string, string> = new Map();
  private bannedClientIds: Map<string, string> = new Map(); // clientId -> banning admin name
  // Keyed by clientId where the client has one, so closing the socket at the limit
  // cannot hand out a fresh allowance on reconnect.
  private authFailures: Map<string, { count: number; firstAt: number }> = new Map();

  // Heartbeat: track last pong time per connection
  private lastPong: Map<string, number> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  // Singer timeout: auto-advance if singer goes inactive
  private singerTimer: ReturnType<typeof setTimeout> | null = null;
  // Clock-authority stall: the singer's video-sync stream is the room's heartbeat for playback
  private videoStallTimer: ReturnType<typeof setTimeout> | null = null;
  // Room-scoped feature flags, parsed once from the FEATURE_FLAGS env var
  private flags: Record<string, boolean> | null = null;
  private hydrated = false;
  // Registry reporting (debounced - max once per 30s)
  private lastRegistryReport = 0;
  private registryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly room: Party.Room) {}

  // ── Persistence ─────────────────────────────────────────────

  // Runs before the first onConnect/onRequest, so a woken DO already knows who it is
  async onStart() {
    await this.hydrate();
  }

  private async hydrate() {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      const stored = await this.room.storage.get([
        STORAGE_KEYS.roomName,
        STORAGE_KEYS.isPublic,
        STORAGE_KEYS.passwordHash,
        STORAGE_KEYS.adminClientId,
        STORAGE_KEYS.adminVacatedAt,
        STORAGE_KEYS.bannedClientIds,
      ]);
      const roomName = stored.get(STORAGE_KEYS.roomName);
      const isPublic = stored.get(STORAGE_KEYS.isPublic);
      const passwordHash = stored.get(STORAGE_KEYS.passwordHash);
      const adminClientId = stored.get(STORAGE_KEYS.adminClientId);
      const adminVacatedAt = stored.get(STORAGE_KEYS.adminVacatedAt);
      const bans = stored.get(STORAGE_KEYS.bannedClientIds);

      if (typeof roomName === "string") this.roomName = roomName;
      if (typeof isPublic === "boolean") this.isPublic = isPublic;
      if (typeof passwordHash === "string") this.passwordHash = passwordHash;
      if (typeof adminClientId === "string") this.adminClientId = adminClientId;
      if (typeof adminVacatedAt === "number") this.adminVacatedAt = adminVacatedAt;
      if (Array.isArray(bans)) {
        for (const entry of bans as unknown[]) {
          if (!Array.isArray(entry)) continue;
          const [clientId, bannedBy] = entry as unknown[];
          if (typeof clientId === "string" && typeof bannedBy === "string") {
            this.bannedClientIds.set(clientId, bannedBy);
          }
        }
      }
    } catch {
      // A room that cannot read its identity still works, it just starts fresh
    }
  }

  private persist(patch: Record<string, unknown>) {
    void this.room.storage.put(patch).catch((err: unknown) => {
      console.error(`[KaraokeRoom] Failed to persist ${Object.keys(patch).join(", ")} for ${this.room.id}`, err);
    });
  }

  private persistBans() {
    this.persist({ [STORAGE_KEYS.bannedClientIds]: Array.from(this.bannedClientIds.entries()) });
  }

  // ── Feature flags ───────────────────────────────────────────

  private getFlags(): Record<string, boolean> {
    if (this.flags) return this.flags;
    const parsed: Record<string, boolean> = {};
    const raw = this.room.env.FEATURE_FLAGS;
    if (typeof raw === "string") {
      for (const part of raw.split(",")) {
        const name = part.trim();
        if (name) parsed[name] = true;
      }
    }
    this.flags = parsed;
    return parsed;
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      // Ping all connections
      for (const entry of this.participants.values()) {
        try {
          entry.ws.send(JSON.stringify({ type: "ping" }));
        } catch {
          // Will be cleaned up below
        }
      }
      // Evict connections that haven't ponged in time
      const deadIds: string[] = [];
      for (const [id] of this.participants) {
        const last = this.lastPong.get(id) ?? 0;
        if (now - last > HEARTBEAT_TIMEOUT_MS) {
          deadIds.push(id);
        }
      }
      for (const id of deadIds) {
        console.log(`[KaraokeRoom] Heartbeat timeout for ${id} — evicting`);
        this.removeParticipant(id);
      }
      // Keepalive: a quiet public room still has to outlive the registry expiry,
      // and this is also the only path that refreshes currentSong (status-update
      // never broadcasts state).
      if (
        this.isPublic
        && this.participants.size > 0
        && Date.now() - this.lastRegistryReport >= REGISTRY_KEEPALIVE_MS
      ) {
        this.doRegistryReport();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private resetSingerTimer() {
    if (this.singerTimer) clearTimeout(this.singerTimer);
    this.singerTimer = null;
    if (this.currentSingerId) {
      this.singerTimer = setTimeout(() => {
        if (!this.currentSingerId) return;
        // Fire for both disconnected AND idle connected singers
        console.log(`[KaraokeRoom] Singer ${this.currentSingerId} timed out - advancing queue`);
        this.currentSingerId = null;
        this.mutedBySinger = null;
        this.videoState = null;
        this.promoteNextSinger();
        this.broadcastState();
      }, SINGER_TIMEOUT_MS);
    }
  }

  // Armed on every video-sync while playing, so a singer whose device sleeps or
  // backgrounds stops being the clock instead of leaving the room drifting.
  private resetVideoStallTimer() {
    if (this.videoStallTimer) clearTimeout(this.videoStallTimer);
    this.videoStallTimer = null;
    if (!this.videoState?.playing) return;
    this.videoStallTimer = setTimeout(() => {
      this.videoStallTimer = null;
      this.handleVideoStall();
    }, VIDEO_STALL_MS);
  }

  private handleVideoStall() {
    const current = this.videoState;
    if (!current?.playing) return;
    console.log(`[KaraokeRoom] Singer ${current.singerId} stopped syncing - pausing playback`);
    // Hold the last reported position rather than advancing it: the singer's player
    // most likely froze there, and resuming re-stamps a fresh time anyway.
    this.videoState = { ...current, playing: false, wallTime: Date.now() };
    const singerName = this.participants.get(current.singerId)?.name ?? "The singer";
    this.resetSingerTimer();
    this.broadcastVideoState();
    this.broadcastSystemChat(`Playback paused: ${singerName}'s device stopped responding.`);
  }

  // HTTP health endpoint for monitoring (GET /parties/main/<room-id>)
  async onRequest(req: Party.Request) {
    if (req.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }
    return new Response(JSON.stringify({
      status: "ok",
      participants: this.participants.size,
      queue: this.queue.length,
      hasSinger: this.currentSingerId !== null,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  onConnect(conn: Party.Connection) {
    this.lastPong.set(conn.id, Date.now());
    this.startHeartbeat();
    this.send(conn, { type: "you-joined", peerId: conn.id });

    // Evict connections that don't join within 30s (extra time for name-taken flow)
    setTimeout(() => {
      if (!this.participants.has(conn.id)) {
        console.log(`[KaraokeRoom] Connection ${conn.id} never joined - disconnecting`);
        this.lastPong.delete(conn.id);
        try { conn.close(); } catch { /* already closed */ }
      }
    }, 30_000);
  }

  onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(message as string) as ClientMessage;
    } catch {
      this.send(sender, { type: "error", message: "Invalid JSON" });
      return;
    }

    switch (msg.type) {
      case "pong":
        this.lastPong.set(sender.id, Date.now());
        return; // no further processing needed
      case "join":
        this.handleJoin(sender, msg.name, msg.clientId);
        break;
      case "join-queue":
        this.handleJoinQueue(sender);
        break;
      case "leave-queue":
        this.handleLeaveQueue(sender);
        break;
      case "finish-singing":
        this.handleFinishSinging(sender);
        break;
      case "chat":
        this.handleChat(sender, msg.text);
        break;
      case "status-update":
        this.handleStatusUpdate(sender, {
          isMuted: msg.isMuted,
          isSharingAudio: msg.isSharingAudio,
          currentSong: msg.currentSong,
          browser: msg.browser,
          lkIdentity: msg.lkIdentity,
          isDeafened: msg.isDeafened,
        });
        break;
      case "reaction":
        this.handleReaction(sender, msg.emoji);
        break;
      case "mute-all":
        this.handleMuteAll(sender);
        break;
      case "unmute-all":
        this.handleUnmuteAll(sender);
        break;
      case "mix-adjust":
        this.handleMixAdjust(sender, msg.voice, msg.music);
        break;
      case "video-load":
        this.handleVideoLoad(sender, msg.videoId);
        break;
      case "video-sync":
        this.handleVideoSync(sender, msg.playing, msg.videoTime, msg.videoId, msg.stalled);
        break;
      case "time-sync":
        this.handleTimeSync(sender, msg.t0);
        break;
      case "kick":
        this.handleKick(sender, msg.peerId);
        break;
      case "set-password":
        void this.handleSetPassword(sender, msg.password);
        break;
      case "transfer-admin":
        this.handleTransferAdmin(sender, msg.peerId);
        break;
      case "auth":
        void this.handleAuth(sender, msg.password);
        break;
      case "set-room-name":
        this.handleSetRoomName(sender, msg.name);
        break;
      case "set-public":
        this.handleSetPublic(sender, msg.isPublic);
        break;
      case "remove-from-queue":
        this.handleRemoveFromQueue(sender, msg.peerId);
        break;
      case "skip-singer":
        this.handleSkipSinger(sender);
        break;
      default:
        this.send(sender, { type: "error", message: "Unknown message type" });
    }
  }

  onClose(conn: Party.Connection) {
    // Clean up pending auth and lastPong for pre-join connections. Auth failures stay:
    // wiping them here is what let a reconnect reset the password rate limit.
    this.pendingAuth.delete(conn.id);
    if (!this.participants.has(conn.id)) {
      this.lastPong.delete(conn.id);
      this.clientIdByPeer.delete(conn.id);
    }
    this.removeParticipant(conn.id);
  }

  onError(conn: Party.Connection, _error: Error) {
    console.error(`[KaraokeRoom] Connection error for ${conn.id}`);
    this.pendingAuth.delete(conn.id);
    if (!this.participants.has(conn.id)) {
      this.lastPong.delete(conn.id);
      this.clientIdByPeer.delete(conn.id);
    }
    this.removeParticipant(conn.id);
  }

  private removeParticipant(peerId: string) {
    const participant = this.participants.get(peerId);
    if (!participant) return;

    this.participants.delete(peerId);
    this.participantStatus.delete(peerId);
    this.lastPong.delete(peerId);
    this.pendingAuth.delete(peerId);
    this.clientIdByPeer.delete(peerId);

    // If they were admin, leave the seat vacant for a grace window so a refresh
    // can reclaim it before the earliest remaining joiner inherits the room.
    if (this.adminPeerId === peerId) {
      this.adminPeerId = null;
      this.startAdminGrace(participant.name);
    }

    // Remove from queue
    this.queue = this.queue.filter((id) => id !== peerId);

    // If they were the current singer, promote next
    if (this.currentSingerId === peerId) {
      this.currentSingerId = null;
      this.videoState = null;
      this.promoteNextSinger();
    }

    // If the room is now empty, drop the session state so the DO can be GC'd cleanly.
    // Room identity (name, listing, password, admin, bans) is persisted and deliberately kept.
    if (this.participants.size === 0) {
      console.log(`[KaraokeRoom] Room ${this.room.id} is empty - resetting session state`);
      this.queue = [];
      this.currentSingerId = null;
      this.mutedBySinger = null;
      this.videoState = null;
      this.chatMessages = [];
      this.participantStatus.clear();
      this.lastPong.clear();
      this.adminPeerId = null;
      this.pendingAuth.clear();
      this.clientIdByPeer.clear();
      this.authFailures.clear();
      this.stopHeartbeat();
      if (this.singerTimer) clearTimeout(this.singerTimer);
      this.singerTimer = null;
      if (this.videoStallTimer) clearTimeout(this.videoStallTimer);
      this.videoStallTimer = null;
      if (this.adminGraceTimer) clearTimeout(this.adminGraceTimer);
      this.adminGraceTimer = null;
      if (this.registryTimer) clearTimeout(this.registryTimer);
      this.registryTimer = null;
      this.deleteFromRegistry();
      return; // no one to broadcast to
    }

    this.broadcast({ type: "peer-left", peerId });
    this.broadcastState();
  }

  // ── Handlers ────────────────────────────────────────────────

  private handleJoin(sender: Party.Connection, name: string, clientId?: string) {
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      this.send(sender, { type: "error", message: "Name is required" });
      return;
    }

    const cleanClientId = typeof clientId === "string" && clientId.length > 0 && clientId.length <= 64
      ? clientId
      : null;

    if (cleanClientId) {
      const bannedBy = this.bannedClientIds.get(cleanClientId);
      if (bannedBy !== undefined) {
        this.send(sender, { type: "kicked", by: bannedBy });
        try { sender.close(); } catch { /* already closed */ }
        return;
      }
      this.clientIdByPeer.set(sender.id, cleanClientId);
    }

    const trimmedName = name.trim().slice(0, MAX_NAME_LENGTH);

    // Check for duplicate names (case-insensitive)
    // Allow "Anonymous" duplicates - multiple unnamed users is expected
    // Skip check for existing participants updating their own name (rename flow)
    const existing = this.participants.get(sender.id);
    const isAnonymous = trimmedName.toLowerCase() === "anonymous";

    // Find any existing participant with the same name (not this connection)
    let duplicatePeerId: string | null = null;
    if (!isAnonymous) {
      const now = Date.now();
      for (const [id, p] of this.participants) {
        if (p.name.toLowerCase() === trimmedName.toLowerCase() && id !== sender.id) {
          // Check if old connection is stale (no pong for >20s - likely a refresh)
          const lastPong = this.lastPong.get(id) ?? 0;
          if (now - lastPong > 20_000) {
            // Stale ghost from refresh - evict and close the old socket
            try { p.ws.close(); } catch { /* already closed */ }
            this.removeParticipant(id);
          } else {
            // Active connection - real duplicate
            duplicatePeerId = id;
          }
          break;
        }
      }
    }

    if (duplicatePeerId) {
      const suggestions: string[] = [];
      for (let i = 2; i <= 10; i++) {
        const suffix = String(i);
        // Truncate base name to make room for suffix within MAX_NAME_LENGTH
        const base = trimmedName.slice(0, MAX_NAME_LENGTH - suffix.length);
        const candidate = `${base}${suffix}`;
        const taken = Array.from(this.participants.values()).some(
          (p) => p.name.toLowerCase() === candidate.toLowerCase()
        );
        if (!taken && candidate.toLowerCase() !== trimmedName.toLowerCase()) suggestions.push(candidate);
        if (suggestions.length >= 3) break;
      }
      this.send(sender, { type: "name-taken", name: trimmedName, suggestions });
      return;
    }

    // Update name if already a participant (rename), otherwise add new
    if (existing) {
      existing.name = trimmedName;
    } else {
      // A password now outlives an empty room, so there is no first-joiner exemption:
      // that exemption would hand a locked room to whoever arrived after it emptied.
      if (this.passwordHash !== null) {
        this.pendingAuth.set(sender.id, { name: trimmedName, ws: sender });
        this.send(sender, { type: "auth-required" });
        return;
      }
      this.participants.set(sender.id, { name: trimmedName, ws: sender });
      this.claimAdminOnJoin(sender.id, trimmedName);
    }

    // Notify all OTHER connections about the new peer
    this.broadcast(
      { type: "peer-joined", peerId: sender.id, name: trimmedName },
      sender.id
    );

    // Send full room state to everyone
    this.broadcastState();
  }

  private handleJoinQueue(sender: Party.Connection) {
    if (!this.participants.has(sender.id)) {
      this.send(sender, {
        type: "error",
        message: "Must join the room before joining the queue",
      });
      return;
    }

    // Don't add duplicates
    if (this.queue.includes(sender.id)) {
      return;
    }

    this.queue.push(sender.id);

    // If nobody is singing, promote
    if (this.currentSingerId === null) {
      this.promoteNextSinger();
    }

    this.broadcastState();
  }

  private handleLeaveQueue(sender: Party.Connection) {
    const idx = this.queue.indexOf(sender.id);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
    }

    // If they were the current singer and chose to leave queue, clear them
    if (this.currentSingerId === sender.id) {
      this.currentSingerId = null;
      this.videoState = null;
      this.promoteNextSinger();
    }

    this.broadcastState();
  }

  private handleFinishSinging(sender: Party.Connection) {
    if (this.currentSingerId !== sender.id) {
      this.send(sender, {
        type: "error",
        message: "You are not the current singer",
      });
      return;
    }

    this.currentSingerId = null;
    this.videoState = null;
    this.promoteNextSinger();
    this.broadcastState();
  }

  private handleChat(sender: Party.Connection, text: string) {
    const participant = this.participants.get(sender.id);
    if (!participant) {
      this.send(sender, { type: "error", message: "Must join the room before chatting" });
      return;
    }

    const trimmedText = text.trim().slice(0, MAX_CHAT_LENGTH);
    if (!trimmedText) return;

    const chatMsg: ChatMessage = {
      from: sender.id,
      fromName: participant.name,
      text: trimmedText,
      timestamp: Date.now(),
    };

    // Store in memory (cap at MAX_CHAT_MESSAGES)
    this.chatMessages.push(chatMsg);
    if (this.chatMessages.length > MAX_CHAT_MESSAGES) {
      this.chatMessages.shift();
    }

    // Broadcast chat message to all participants
    this.broadcast({
      type: "chat",
      from: chatMsg.from,
      fromName: chatMsg.fromName,
      text: chatMsg.text,
      timestamp: chatMsg.timestamp,
    });
  }

  private broadcastSystemChat(text: string) {
    const trimmedText = text.trim().slice(0, MAX_CHAT_LENGTH);
    if (!trimmedText) return;
    const chatMsg: ChatMessage = {
      from: "system",
      fromName: "Karaoke Now",
      text: trimmedText,
      timestamp: Date.now(),
    };
    this.chatMessages.push(chatMsg);
    if (this.chatMessages.length > MAX_CHAT_MESSAGES) {
      this.chatMessages.shift();
    }
    this.broadcast({
      type: "chat",
      from: chatMsg.from,
      fromName: chatMsg.fromName,
      text: chatMsg.text,
      timestamp: chatMsg.timestamp,
    });
  }

  private handleReaction(sender: Party.Connection, emoji: string) {
    const participant = this.participants.get(sender.id);
    if (!participant) return;
    if (!ALLOWED_EMOJIS.has(emoji)) return; // reject unknown emojis
    this.broadcast({
      type: "reaction",
      from: sender.id,
      fromName: participant.name,
      emoji,
    });
  }

  private handleStatusUpdate(sender: Party.Connection, status: ParticipantStatus) {
    if (!this.participants.has(sender.id)) return;

    // Cap browser string length to prevent abuse
    if (status.browser) {
      status.browser = status.browser.slice(0, MAX_BROWSER_LENGTH);
    }
    this.participantStatus.set(sender.id, status);

    // Singer timer: cancel while sharing, restart when idle
    if (sender.id === this.currentSingerId) {
      if (status.isSharingAudio) {
        // Actively sharing - cancel idle timer (unlimited singing time)
        if (this.singerTimer) { clearTimeout(this.singerTimer); this.singerTimer = null; }
      } else {
        // Not sharing - restart idle timer (60s to start/resume or get auto-advanced)
        this.resetSingerTimer();
      }
    }
    // Send lightweight status update instead of full room state
    this.broadcast({
      type: "participant-status",
      peerId: sender.id,
      status,
    });
  }

  private handleMuteAll(sender: Party.Connection) {
    // Only the current singer can mute everyone
    if (this.currentSingerId !== sender.id) {
      this.send(sender, { type: "error", message: "Only the singer can mute all" });
      return;
    }
    const participant = this.participants.get(sender.id);
    if (!participant) return;

    this.mutedBySinger = participant.name;

    // Broadcast to all except the singer
    for (const [id, entry] of this.participants) {
      if (id !== sender.id) {
        this.send(entry.ws, { type: "mute-all", singerName: participant.name });
      }
    }
  }

  private handleUnmuteAll(sender: Party.Connection) {
    if (this.currentSingerId !== sender.id) {
      this.send(sender, { type: "error", message: "Only the singer can unmute all" });
      return;
    }

    this.mutedBySinger = null;

    // Broadcast to all except the singer
    for (const [id, entry] of this.participants) {
      if (id !== sender.id) {
        this.send(entry.ws, { type: "unmute-all" });
      }
    }
  }

  private handleMixAdjust(sender: Party.Connection, voice: number, music?: number) {
    if (!this.currentSingerId) return;
    if (!Number.isFinite(voice)) return;
    const participant = this.participants.get(sender.id);
    if (!participant) return;

    const clampedVoice = Math.max(0, Math.min(1.5, voice));
    // Music is local to each client now, but pre-YouTube clients still read it off
    // the wire and feed it to an AudioParam, so it always ships with a finite value.
    const clampedMusic = Number.isFinite(music) ? Math.max(0, Math.min(1.5, music as number)) : 1;
    const isSinger = sender.id === this.currentSingerId;

    if (isSinger) {
      // Singer adjusted - broadcast to all listeners so their sliders sync
      for (const [id, entry] of this.participants) {
        if (id !== sender.id) {
          this.send(entry.ws, { type: "mix-adjust", fromName: participant.name, voice: clampedVoice, music: clampedMusic });
        }
      }
    } else {
      // Listener adjusted - send to singer to apply gain + announce in chat
      const singer = this.participants.get(this.currentSingerId);
      if (!singer) return;
      this.send(singer.ws, { type: "mix-adjust", fromName: participant.name, voice: clampedVoice, music: clampedMusic });
    }
  }

  // ── Synced video playback ───────────────────────────────────

  private handleVideoLoad(sender: Party.Connection, videoId: string) {
    if (this.currentSingerId !== sender.id) {
      this.send(sender, { type: "error", message: "Only the singer can control playback" });
      return;
    }
    if (typeof videoId !== "string" || !YOUTUBE_ID_RE.test(videoId)) {
      this.send(sender, { type: "error", message: "Invalid video link" });
      return;
    }

    // loadedAt changes on every load, so re-picking the current video restarts it
    this.videoState = {
      videoId,
      playing: false,
      videoTime: 0,
      wallTime: Date.now(),
      loadedAt: Date.now(),
      singerId: sender.id,
    };
    // Loaded but not playing yet: the idle timer keeps running until playback starts
    this.resetSingerTimer();
    this.resetVideoStallTimer();
    this.broadcastVideoState();
  }

  private handleVideoSync(sender: Party.Connection, playing: boolean, videoTime: number, videoId?: string, stalled?: boolean) {
    if (this.currentSingerId !== sender.id) {
      this.send(sender, { type: "error", message: "Only the singer can control playback" });
      return;
    }
    const current = this.videoState;
    if (!current) return;
    if (!Number.isFinite(videoTime) || videoTime < 0) return;
    // An in-flight sync for the previous video must not stamp the newly loaded one
    if (videoId !== undefined && videoId !== current.videoId) return;

    // A rebuffering singer is alive but its clock is frozen: re-arm the stall timer
    // without re-stamping a position that would drag every listener backwards.
    if (stalled === true) {
      this.resetVideoStallTimer();
      return;
    }

    this.videoState = {
      ...current,
      playing: playing === true,
      videoTime,
      wallTime: Date.now(),
      singerId: sender.id,
    };

    // Playing counts as activity, so the singer gets unlimited time on stage
    if (this.videoState.playing) {
      if (this.singerTimer) { clearTimeout(this.singerTimer); this.singerTimer = null; }
    } else {
      this.resetSingerTimer();
    }
    this.resetVideoStallTimer();

    this.broadcastVideoState();
  }

  private handleTimeSync(sender: Party.Connection, t0: number) {
    if (!Number.isFinite(t0)) return;
    this.send(sender, { type: "time-sync", t0, t1: Date.now() });
  }

  // Point broadcast, not broadcastState(): video-sync fires every ~2s and a full
  // room-state would also re-trigger registry reporting.
  private broadcastVideoState() {
    this.broadcast({ type: "video-state", video: this.videoState });
  }

  // ── Admin Handlers ──────────────────────────────────────────

  // Only the departed admin's clientId may take a vacant seat early. Anyone else arms
  // the grace window, which an empty room and a DO restart both leave unarmed.
  private claimAdminOnJoin(peerId: string, name: string) {
    if (this.adminPeerId !== null) return;
    const clientId = this.clientIdByPeer.get(peerId) ?? null;
    const isReclaim = clientId !== null && clientId === this.adminClientId;
    if (!isReclaim && this.adminClientId !== null) {
      this.armAdminGrace();
      return;
    }

    if (this.adminGraceTimer) {
      clearTimeout(this.adminGraceTimer);
      this.adminGraceTimer = null;
    }
    this.adminPeerId = peerId;
    this.adminClientId = clientId;
    this.adminVacatedAt = null;
    this.persist({
      [STORAGE_KEYS.adminClientId]: clientId,
      [STORAGE_KEYS.adminVacatedAt]: null,
    });
    this.broadcast({ type: "admin-changed", peerId, name });
    if (isReclaim) this.broadcastSystemChat(`${name} is back as room admin`);
  }

  private startAdminGrace(departedName: string) {
    if (this.adminGraceTimer) clearTimeout(this.adminGraceTimer);
    this.adminGraceTimer = null;
    this.adminVacatedAt = Date.now();
    this.persist({ [STORAGE_KEYS.adminVacatedAt]: this.adminVacatedAt });
    if (this.participants.size === 0) return;

    this.broadcastSystemChat(
      `${departedName} left. The admin seat is open for ${Math.round(ADMIN_GRACE_MS / 1000)}s in case they come back.`
    );
    this.armAdminGrace();
  }

  // adminVacatedAt is persisted because the timer is not: only what remains of the
  // window is granted, and a restart that lost it starts the window over.
  private armAdminGrace() {
    if (this.adminPeerId !== null || this.adminGraceTimer !== null) return;
    if (this.adminVacatedAt === null) {
      this.adminVacatedAt = Date.now();
      this.persist({ [STORAGE_KEYS.adminVacatedAt]: this.adminVacatedAt });
    }
    const remaining = ADMIN_GRACE_MS - (Date.now() - this.adminVacatedAt);
    if (remaining <= 0) {
      this.promoteAdminAfterGrace();
      return;
    }
    this.adminGraceTimer = setTimeout(() => {
      this.adminGraceTimer = null;
      this.promoteAdminAfterGrace();
    }, remaining);
  }

  private promoteAdminAfterGrace() {
    if (this.adminPeerId !== null) return;
    for (const [id, entry] of this.participants) {
      this.adminPeerId = id;
      this.adminClientId = this.clientIdByPeer.get(id) ?? null;
      this.adminVacatedAt = null;
      this.persist({
        [STORAGE_KEYS.adminClientId]: this.adminClientId,
        [STORAGE_KEYS.adminVacatedAt]: null,
      });
      this.broadcast({ type: "admin-changed", peerId: id, name: entry.name });
      this.broadcastSystemChat(`${entry.name} is now the room admin`);
      this.broadcastState();
      return;
    }
    // Nobody left to promote: release the seat so the next joiner owns the room
    this.adminClientId = null;
    this.adminVacatedAt = null;
    this.persist({
      [STORAGE_KEYS.adminClientId]: null,
      [STORAGE_KEYS.adminVacatedAt]: null,
    });
  }

  private handleKick(sender: Party.Connection, targetPeerId: string) {
    if (this.adminPeerId !== sender.id) {
      this.send(sender, { type: "error", message: "Only the admin can kick" });
      return;
    }
    const admin = this.participants.get(sender.id);
    const target = this.participants.get(targetPeerId);
    if (!admin || !target) return;
    if (targetPeerId === sender.id) return; // can't kick yourself

    const targetName = target.name;
    const targetClientId = this.clientIdByPeer.get(targetPeerId);
    if (targetClientId) {
      if (this.bannedClientIds.size >= MAX_BANNED_CLIENTS) {
        const oldest = this.bannedClientIds.keys().next().value;
        if (oldest !== undefined) this.bannedClientIds.delete(oldest);
      }
      this.bannedClientIds.set(targetClientId, admin.name);
      this.persistBans();
    }
    this.send(target.ws, { type: "kicked", by: admin.name });
    try { target.ws.close(); } catch { /* already closed */ }
    this.removeParticipant(targetPeerId);
    this.broadcastSystemChat(`${targetName} was kicked by ${admin.name}`);
  }

  private handleTransferAdmin(sender: Party.Connection, targetPeerId: string) {
    if (this.adminPeerId !== sender.id) {
      this.send(sender, { type: "error", message: "Only the admin can transfer admin" });
      return;
    }
    const target = this.participants.get(targetPeerId);
    if (!target) return;

    if (this.adminGraceTimer) {
      clearTimeout(this.adminGraceTimer);
      this.adminGraceTimer = null;
    }
    this.adminPeerId = targetPeerId;
    this.adminClientId = this.clientIdByPeer.get(targetPeerId) ?? null;
    this.adminVacatedAt = null;
    this.persist({
      [STORAGE_KEYS.adminClientId]: this.adminClientId,
      [STORAGE_KEYS.adminVacatedAt]: null,
    });
    this.broadcast({ type: "admin-changed", peerId: targetPeerId, name: target.name });
    this.broadcastSystemChat(`${target.name} is now the room admin`);
    this.broadcastState();
  }

  private sanitizeRoomName(raw: string | null): string | null {
    if (typeof raw !== "string") return null;
    const cleaned = raw
      .replace(CONTROL_CHARS_RE, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_ROOM_NAME_LENGTH)
      .trim();
    return cleaned || null;
  }

  private handleSetRoomName(sender: Party.Connection, name: string | null) {
    if (this.adminPeerId !== sender.id) {
      this.send(sender, { type: "error", message: "Only the admin can rename the room" });
      return;
    }
    const cleaned = this.sanitizeRoomName(name);
    if (cleaned === this.roomName) return;

    this.roomName = cleaned;
    this.persist({ [STORAGE_KEYS.roomName]: cleaned });
    this.broadcastSystemChat(cleaned ? `Room renamed to "${cleaned}"` : "Room name removed");
    this.broadcastState();
    if (this.isPublic) this.doRegistryReport();
  }

  private handleSetPublic(sender: Party.Connection, isPublic: boolean) {
    if (this.adminPeerId !== sender.id) {
      this.send(sender, { type: "error", message: "Only the admin can change room listing" });
      return;
    }
    const next = isPublic === true;
    if (next === this.isPublic) return;

    this.isPublic = next;
    this.persist({ [STORAGE_KEYS.isPublic]: next });
    if (this.registryTimer) {
      clearTimeout(this.registryTimer);
      this.registryTimer = null;
    }
    if (next) {
      this.doRegistryReport();
      this.broadcastSystemChat("Room is now listed in Browse");
    } else {
      this.deleteFromRegistry();
      this.broadcastSystemChat("Room is no longer listed in Browse");
    }
    this.broadcastState();
  }

  private handleRemoveFromQueue(sender: Party.Connection, targetPeerId: string) {
    if (this.adminPeerId !== sender.id) {
      this.send(sender, { type: "error", message: "Only the admin can manage the queue" });
      return;
    }
    const admin = this.participants.get(sender.id);
    if (!admin) return;
    const idx = this.queue.indexOf(targetPeerId);
    if (idx === -1) return;

    this.queue.splice(idx, 1);
    const targetName = this.participants.get(targetPeerId)?.name ?? "Someone";
    this.broadcastSystemChat(`${targetName} was removed from the queue by ${admin.name}`);
    this.broadcastState();
  }

  // Mirrors handleFinishSinging exactly: currentSingerId, mutedBySinger and
  // videoState must all clear before promoteNextSinger or a ghost video keeps playing.
  private handleSkipSinger(sender: Party.Connection) {
    if (this.adminPeerId !== sender.id) {
      this.send(sender, { type: "error", message: "Only the admin can skip the singer" });
      return;
    }
    const admin = this.participants.get(sender.id);
    if (!admin || this.currentSingerId === null) return;

    const skippedName = this.participants.get(this.currentSingerId)?.name ?? "The singer";
    this.currentSingerId = null;
    this.mutedBySinger = null;
    this.videoState = null;
    this.promoteNextSinger();
    this.broadcastSystemChat(`${skippedName} was skipped by ${admin.name}`);
    this.broadcastState();
  }

  private async handleSetPassword(sender: Party.Connection, password: string | null) {
    if (this.adminPeerId !== sender.id) {
      this.send(sender, { type: "error", message: "Only the admin can set a password" });
      return;
    }

    if (password === null || password === "") {
      this.passwordHash = null;
      this.admitPendingAuth();
    } else {
      this.passwordHash = await this.hashPassword(password);
    }
    this.persist({ [STORAGE_KEYS.passwordHash]: this.passwordHash });
    this.broadcastSystemChat(this.passwordHash ? "Room is now locked" : "Room is now unlocked");
    this.broadcastState();
  }

  // Removing the password strands anyone sitting on the auth modal, so let them in
  private admitPendingAuth() {
    if (this.pendingAuth.size === 0) return;
    const waiting = Array.from(this.pendingAuth.entries());
    this.pendingAuth.clear();
    for (const [peerId, entry] of waiting) {
      this.participants.set(peerId, entry);
      this.authFailures.delete(this.authFailureKey(peerId));
      this.claimAdminOnJoin(peerId, entry.name);
      this.broadcast({ type: "peer-joined", peerId, name: entry.name }, peerId);
    }
  }

  private authFailureKey(peerId: string): string {
    return this.clientIdByPeer.get(peerId) ?? peerId;
  }

  private recordAuthFailure(peerId: string): number {
    const now = Date.now();
    for (const [key, entry] of this.authFailures) {
      if (now - entry.firstAt > AUTH_FAILURE_WINDOW_MS) this.authFailures.delete(key);
    }
    const key = this.authFailureKey(peerId);
    const existing = this.authFailures.get(key);
    const entry = existing ?? { count: 0, firstAt: now };
    entry.count += 1;
    this.authFailures.delete(key);
    this.authFailures.set(key, entry);
    while (this.authFailures.size > MAX_AUTH_FAILURE_KEYS) {
      const oldest = this.authFailures.keys().next().value;
      if (oldest === undefined) break;
      this.authFailures.delete(oldest);
    }
    return entry.count;
  }

  private async handleAuth(sender: Party.Connection, password: string) {
    const pending = this.pendingAuth.get(sender.id);
    if (!pending) {
      this.send(sender, { type: "error", message: "No pending auth" });
      return;
    }

    if (!this.passwordHash) {
      // Password was removed while they were entering it - let them in
      this.pendingAuth.delete(sender.id);
      this.authFailures.delete(this.authFailureKey(sender.id));
      this.participants.set(sender.id, pending);
      this.claimAdminOnJoin(sender.id, pending.name);
      this.broadcast({ type: "peer-joined", peerId: sender.id, name: pending.name }, sender.id);
      this.broadcastState();
      return;
    }

    const inputHash = await this.hashPassword(password);
    if (!this.constantTimeEqual(inputHash, this.passwordHash)) {
      const failures = this.recordAuthFailure(sender.id);
      this.send(sender, { type: "auth-failed" });
      if (failures >= MAX_AUTH_FAILURES) {
        this.pendingAuth.delete(sender.id);
        this.clientIdByPeer.delete(sender.id);
        this.lastPong.delete(sender.id);
        try { sender.close(); } catch { /* already closed */ }
      }
      return;
    }

    // Auth passed - add to participants
    this.pendingAuth.delete(sender.id);
    this.authFailures.delete(this.authFailureKey(sender.id));
    this.participants.set(sender.id, pending);
    this.claimAdminOnJoin(sender.id, pending.name);
    this.broadcast({ type: "peer-joined", peerId: sender.id, name: pending.name }, sender.id);
    this.broadcastState();
  }

  private async hashPassword(password: string): Promise<string> {
    const data = new TextEncoder().encode(password);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  private constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  // ── Helpers ─────────────────────────────────────────────────

  private promoteNextSinger() {
    if (this.currentSingerId !== null) return;
    // Clear mute-all and any leftover video when no singer is active
    this.mutedBySinger = null;
    this.videoState = null;
    this.resetVideoStallTimer();
    if (this.queue.length === 0) {
      this.resetSingerTimer();
      return;
    }

    // Only promote participants that are still connected
    while (this.queue.length > 0) {
      const nextId = this.queue.shift()!;
      if (this.participants.has(nextId)) {
        this.currentSingerId = nextId;
        this.resetSingerTimer();
        return;
      }
    }
    this.resetSingerTimer();
  }

  private buildRoomState(): RoomState {
    const participants = Array.from(this.participants.entries()).map(
      ([id, entry]) => ({ id, name: entry.name })
    );

    const participantStatus: Record<string, ParticipantStatus> = {};
    for (const [id, status] of this.participantStatus) {
      participantStatus[id] = status;
    }

    return {
      participants,
      // Only include queue entries that are still connected
      queue: this.queue.filter((id) => this.participants.has(id)),
      currentSingerId: this.currentSingerId,
      chatMessages: [...this.chatMessages],
      participantStatus,
      mutedBySinger: this.mutedBySinger,
      adminPeerId: this.adminPeerId,
      isLocked: this.passwordHash !== null,
      video: this.videoState,
      roomName: this.roomName,
      isPublic: this.isPublic,
      flags: this.getFlags(),
    };
  }

  private broadcastState() {
    const msg: ServerMessage = {
      type: "room-state",
      state: this.buildRoomState(),
    };
    this.broadcast(msg);
    this.reportToRegistry();
  }

  private isBroadcasting = false;
  private pendingRemovals: string[] = [];

  private broadcast(msg: ServerMessage, excludeId?: string) {
    const raw = JSON.stringify(msg);
    const deadIds: string[] = [];
    this.isBroadcasting = true;
    for (const [id, entry] of this.participants) {
      if (id === excludeId) continue;
      try {
        entry.ws.send(raw);
      } catch {
        deadIds.push(id);
      }
    }
    this.isBroadcasting = false;

    // Clean up dead connections found during broadcast.
    // Defer if we're inside a re-entrant broadcast to prevent double-cleanup.
    this.pendingRemovals.push(...deadIds);
    if (this.pendingRemovals.length > 0) {
      const toRemove = [...new Set(this.pendingRemovals)];
      this.pendingRemovals = [];
      for (const id of toRemove) {
        this.removeParticipant(id);
      }
    }
  }

  private send(conn: Party.Connection, msg: ServerMessage) {
    try {
      conn.send(JSON.stringify(msg));
    } catch {
      // Connection is dead, will be cleaned up on onClose/onError
    }
  }

  // ── Registry reporting ──────────────────────────────────────

  private reportToRegistry() {
    if (!this.isPublic) return;
    const now = Date.now();
    const elapsed = now - this.lastRegistryReport;
    if (elapsed < 30_000) {
      // Debounce: schedule a report after the remaining cooldown
      if (!this.registryTimer) {
        this.registryTimer = setTimeout(() => {
          this.registryTimer = null;
          this.doRegistryReport();
        }, 30_000 - elapsed);
      }
      return;
    }
    this.doRegistryReport();
  }

  private registryHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = this.room.env.REGISTRY_TOKEN;
    if (typeof token === "string" && token) headers["x-registry-token"] = token;
    return headers;
  }

  private doRegistryReport() {
    if (!this.isPublic) return;
    this.lastRegistryReport = Date.now();
    const singerEntry = this.currentSingerId
      ? this.participants.get(this.currentSingerId)
      : undefined;
    const singerStatus = this.currentSingerId
      ? this.participantStatus.get(this.currentSingerId)
      : undefined;

    const currentSong = singerStatus?.currentSong ?? null;

    const body = JSON.stringify({
      name: this.roomName,
      participantCount: this.participants.size,
      currentSinger: singerEntry?.name ?? null,
      currentSong,
      isLocked: this.passwordHash !== null,
    });

    const registry = this.room.context.parties.registry;
    if (!registry) return;
    const stub = registry.get("global");
    void stub.fetch(`/?room=${encodeURIComponent(this.room.id)}`, {
      method: "POST",
      headers: this.registryHeaders(),
      body,
    }).catch(() => {});
  }

  private deleteFromRegistry() {
    // The entry is gone, so the debounce has nothing left to protect: a room that
    // refills right after emptying should reappear in /browse on the next state.
    this.lastRegistryReport = 0;
    const registry = this.room.context.parties.registry;
    if (!registry) return;
    const stub = registry.get("global");
    void stub.fetch(`/?room=${encodeURIComponent(this.room.id)}`, {
      method: "DELETE",
      headers: this.registryHeaders(),
    }).catch(() => {});
  }
}
