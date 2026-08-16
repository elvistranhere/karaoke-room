import { describe, expect, it } from "vitest";
import { clientMessageSchema, roomStateSchema, serverMessageSchema } from "~/shared/protocol";

describe("clientMessageSchema", () => {
  it("accepts every variant the client sends", () => {
    const messages = [
      { type: "join", name: "Elvis" },
      { type: "join", name: "Elvis", clientId: "abc" },
      { type: "join-queue" },
      { type: "leave-queue" },
      { type: "finish-singing" },
      { type: "chat", text: "hi" },
      { type: "status-update", isMuted: false, isSharingAudio: true, currentSong: null },
      {
        type: "status-update",
        isMuted: true,
        isSharingAudio: false,
        currentSong: "Song",
        browser: "Chrome",
        lkIdentity: "elvis-1",
        isDeafened: true,
      },
      { type: "reaction", emoji: "🔥" },
      { type: "mute-all" },
      { type: "unmute-all" },
      { type: "mix-adjust", voice: 1 },
      { type: "mix-adjust", voice: 1, music: 0.5 },
      { type: "video-load", videoId: "dQw4w9WgXcQ" },
      { type: "video-sync", playing: true, videoTime: 12.5 },
      { type: "video-sync", playing: true, videoTime: 12.5, videoId: "dQw4w9WgXcQ", stalled: true },
      { type: "time-sync", t0: 1 },
      { type: "kick", peerId: "peer-1" },
      { type: "set-password", password: "hunter2" },
      { type: "set-password", password: null },
      { type: "transfer-admin", peerId: "peer-1" },
      { type: "auth", password: "hunter2" },
      { type: "set-room-name", name: "Party" },
      { type: "set-room-name", name: null },
      { type: "set-public", isPublic: true },
      { type: "remove-from-queue", peerId: "peer-1" },
      { type: "skip-singer" },
      { type: "pong" },
    ];
    for (const message of messages) {
      expect(clientMessageSchema.safeParse(message).success, JSON.stringify(message)).toBe(true);
    }
  });

  it("rejects unknown and malformed messages", () => {
    const bad: unknown[] = [
      null,
      "chat",
      [],
      { type: "nope" },
      {},
      { type: "chat" },
      { type: "chat", text: 5 },
      { type: "join" },
      { type: "join", name: 5 },
      { type: "video-sync", playing: "yes", videoTime: 1 },
      { type: "video-sync", playing: true },
      { type: "time-sync", t0: "now" },
      { type: "status-update", isMuted: false, isSharingAudio: true },
      { type: "set-public", isPublic: "yes" },
      { type: "kick" },
    ];
    for (const message of bad) {
      expect(clientMessageSchema.safeParse(message).success, JSON.stringify(message)).toBe(false);
    }
  });

  it("strips unknown fields instead of rejecting, so a newer client still works", () => {
    const parsed = clientMessageSchema.safeParse({ type: "chat", text: "hi", futureField: 1 });
    expect(parsed.success && parsed.data).toEqual({ type: "chat", text: "hi" });
  });

  it("keeps optional fields absent rather than filling them in", () => {
    const parsed = clientMessageSchema.safeParse({ type: "video-sync", playing: false, videoTime: 0 });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).not.toHaveProperty("videoId");
    expect(parsed.success && parsed.data).not.toHaveProperty("stalled");
  });
});

describe("roomStateSchema", () => {
  const state = {
    participants: [{ id: "peer-1", name: "Elvis" }],
    queue: ["peer-1"],
    currentSingerId: "peer-1",
    chatMessages: [{ from: "peer-1", fromName: "Elvis", text: "hi", timestamp: 1 }],
    participantStatus: {
      "peer-1": { isMuted: false, isSharingAudio: true, currentSong: null },
    },
    mutedBySinger: null,
    adminPeerId: "peer-1",
    isLocked: false,
    video: {
      videoId: "dQw4w9WgXcQ",
      playing: true,
      videoTime: 1,
      wallTime: 2,
      loadedAt: 3,
      singerId: "peer-1",
    },
    roomName: "Party",
    isPublic: true,
    flags: { newSync: true },
  };

  it("accepts a full state and an empty room", () => {
    expect(roomStateSchema.safeParse(state).success).toBe(true);
    expect(roomStateSchema.safeParse({
      ...state,
      participants: [],
      queue: [],
      currentSingerId: null,
      chatMessages: [],
      participantStatus: {},
      video: null,
      roomName: null,
      flags: {},
    }).success).toBe(true);
  });

  it("rejects a video state missing the server's wallTime stamp", () => {
    const { wallTime: _dropped, ...video } = state.video;
    expect(roomStateSchema.safeParse({ ...state, video }).success).toBe(false);
  });
});

describe("serverMessageSchema", () => {
  it("accepts what the server broadcasts", () => {
    const messages = [
      { type: "peer-joined", peerId: "peer-1", name: "Elvis" },
      { type: "peer-left", peerId: "peer-1" },
      { type: "you-joined", peerId: "peer-1" },
      { type: "error", message: "Unknown message type" },
      { type: "chat", from: "peer-1", fromName: "Elvis", text: "hi", timestamp: 1 },
      { type: "reaction", from: "peer-1", fromName: "Elvis", emoji: "🔥" },
      { type: "mute-all", singerName: "Elvis" },
      { type: "unmute-all" },
      { type: "mix-adjust", fromName: "Elvis", voice: 1, music: 1 },
      { type: "video-state", video: null },
      { type: "time-sync", t0: 1, t1: 2 },
      { type: "name-taken", name: "Elvis", suggestions: ["Elvis2"] },
      { type: "kicked", by: "Elvis" },
      { type: "auth-required" },
      { type: "auth-failed" },
      { type: "admin-changed", peerId: "peer-1", name: "Elvis" },
      { type: "ping" },
    ];
    for (const message of messages) {
      expect(serverMessageSchema.safeParse(message).success, JSON.stringify(message)).toBe(true);
    }
  });

  it("rejects a variant with the wrong payload", () => {
    expect(serverMessageSchema.safeParse({ type: "kicked" }).success).toBe(false);
    expect(serverMessageSchema.safeParse({ type: "time-sync", t0: 1 }).success).toBe(false);
  });
});
