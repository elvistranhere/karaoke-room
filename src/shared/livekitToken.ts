import { AccessToken, RoomConfiguration, TrackSource } from "livekit-server-sdk";
import { MAX_NAME_LENGTH } from "../lib/playerName";
import { validateRoomCode } from "../lib/room-code";
import type { EnvReader } from "./env";
import { getKeyForRoom, getKeySets } from "./keyRotation";
import { getRedis } from "./redis";

// LiveKit token minting with Redis-backed key rotation, shared by the PartyKit
// endpoint and the legacy Next route so both answer with identical shapes.
// See docs/IDEOLOGY.md for full architecture documentation.

export interface TokenRequest {
  room: string | null;
  name: string | null;
  keyHint: string | null;
}

export interface TokenAnswer {
  status: number;
  body: Record<string, unknown>;
}

export async function mintLiveKitToken(req: TokenRequest, env: EnvReader): Promise<TokenAnswer> {
  try {
    if (!req.room || !req.name) {
      return { status: 400, body: { error: "Missing required query params: room, name" } };
    }

    // Cap name length to prevent oversized JWTs
    const safeName = req.name.trim().slice(0, MAX_NAME_LENGTH);
    if (!safeName) {
      return { status: 400, body: { error: "Name cannot be empty" } };
    }

    // Validate using the same room code format the app generates (6-char custom charset)
    const normalizedRoom = req.room.toUpperCase();
    if (!validateRoomCode(normalizedRoom)) {
      return { status: 400, body: { error: "Invalid room code" } };
    }

    const keySets = getKeySets(env);
    if (keySets.length === 0) {
      return { status: 500, body: { error: "LiveKit credentials not configured" } };
    }

    // Get the key for this room (Redis-backed with fallback to hash)
    const result = await getKeyForRoom(normalizedRoom, keySets, req.keyHint === "next", getRedis(env));

    if (!result) {
      // null = configuration error (missing key index, no keys configured)
      return { status: 500, body: { error: "Server configuration error" } };
    }

    if ("error" in result) {
      const msg = result.error === "all-exhausted"
        ? "All sessions are at capacity right now. Please try again in a few minutes."
        : "This room has hit its session limit. Ask people in the room to create a new one, or create your own.";
      return { status: 429, body: { error: msg, reason: result.error } };
    }

    const { keySet, index } = result;
    const uniqueId = `${safeName}-${crypto.randomUUID().slice(0, 8)}`;

    const at = new AccessToken(keySet.apiKey, keySet.apiSecret, {
      identity: uniqueId,
      name: safeName,
      ttl: 3600, // 1 hour
    });

    at.addGrant({
      room: normalizedRoom,
      roomJoin: true,
      roomCreate: true,
      canPublish: true,
      canSubscribe: true,
      canPublishSources: [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE_AUDIO],
    });

    at.roomConfig = new RoomConfiguration({
      emptyTimeout: 30,
      departureTimeout: 15,
      maxParticipants: 10,
    });

    const token = await at.toJwt();

    return {
      status: 200,
      body: {
        token,
        url: keySet.url,
        keySet: index + 1, // 1-indexed for logging
      },
    };
  } catch (error) {
    console.error("Failed to generate LiveKit token:", error);

    // Check if it's a quota error from JWT signing (unlikely but defensive)
    const isQuota = error instanceof Error &&
      (error.message.includes("quota") || error.message.includes("429"));

    if (isQuota) {
      return {
        status: 429,
        body: { error: "All sessions are at capacity right now. Please try again in a few minutes." },
      };
    }

    return { status: 500, body: { error: "Failed to generate token" } };
  }
}
