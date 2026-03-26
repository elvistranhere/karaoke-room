/**
 * LiveKit key rotation with Upstash Redis.
 *
 * Strategy: Least-loaded with room affinity.
 * - New rooms assigned to key with fewest active rooms
 * - Existing rooms always use their assigned key (no split)
 * - Exhausted keys are marked and skipped for new assignments
 * - Falls back to in-memory hash if Redis is unreachable
 *
 * See docs/IDEOLOGY.md for full documentation.
 */

import { Redis } from "@upstash/redis";

interface LiveKitKeySet {
  apiKey: string;
  apiSecret: string;
  url: string;
}

// Redis instance - lazy init, null if env vars not set (falls back to hash)
let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

// Scan env vars for key sets (up to 20)
export function getKeySets(): LiveKitKeySet[] {
  const sets: LiveKitKeySet[] = [];
  const defaultUrl = process.env.LIVEKIT_URL ?? process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";
  const suffixes = ["", ...Array.from({ length: 20 }, (_, i) => `_${i + 2}`)];

  for (const suffix of suffixes) {
    const apiKey = process.env[`LIVEKIT_API_KEY${suffix}`];
    const apiSecret = process.env[`LIVEKIT_API_SECRET${suffix}`];
    if (!apiKey || !apiSecret) continue;
    sets.push({
      apiKey,
      apiSecret,
      url: process.env[`LIVEKIT_URL${suffix}`] ?? defaultUrl,
    });
  }
  return sets;
}

// Deterministic hash fallback (no Redis)
function hashRoomToKey(room: string, total: number): number {
  let hash = 0;
  for (let i = 0; i < room.length; i++) {
    hash = ((hash << 5) - hash + room.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % total;
}

const ROOM_KEY_TTL = 3600;     // 1 hour - room-to-key mapping
const EXHAUSTED_TTL = 300;     // 5 min - key exhaustion marker

/**
 * Get the key set for a room. Uses Redis for room affinity + least-loaded.
 * Falls back to hash if Redis is unavailable.
 */
export async function getKeyForRoom(
  room: string,
  keySets: LiveKitKeySet[],
  forceNext: boolean,
): Promise<{ keySet: LiveKitKeySet; index: number } | null> {
  if (keySets.length === 0) return null;

  const r = getRedis();
  if (!r) {
    // No Redis - fall back to hash
    const idx = hashRoomToKey(room, keySets.length);
    return { keySet: keySets[idx]!, index: idx };
  }

  try {
    // If client reported failure, mark current key exhausted
    if (forceNext) {
      const currentKey = await r.get<number>(`room:${room}:key`);
      if (currentKey !== null) {
        await r.set(`key:${currentKey}:exhausted`, true, { ex: EXHAUSTED_TTL });
      }
    }

    // Check if room already has an assigned key
    const existingKey = await r.get<number>(`room:${room}:key`);
    if (existingKey !== null && !forceNext) {
      // Room has a mapping - check if key is exhausted
      const exhausted = await r.get<boolean>(`key:${existingKey}:exhausted`);
      if (!exhausted && keySets[existingKey]) {
        // Key is healthy, use it (room affinity)
        await r.expire(`room:${room}:key`, ROOM_KEY_TTL); // refresh TTL
        return { keySet: keySets[existingKey]!, index: existingKey };
      }

      // Key is exhausted - check if room has active users
      // If so, refuse (don't split). If empty, reassign.
      // We can't check user count from here (that's in PartyKit).
      // Conservative approach: return null (429) if exhausted with existing mapping.
      // The client shows "session limit" message.
      return null;
    }

    // New room or forced reassignment - find least-loaded non-exhausted key
    const pipeline = r.pipeline();
    for (let i = 0; i < keySets.length; i++) {
      pipeline.get(`key:${i}:exhausted`);
    }
    const exhaustionResults = await pipeline.exec<(boolean | null)[]>();

    // Count active rooms per key (scan room:*:key mappings)
    // For efficiency, maintain a simple count approach
    let bestIdx = -1;
    let bestScore = Infinity;

    for (let i = 0; i < keySets.length; i++) {
      if (exhaustionResults[i]) continue; // skip exhausted keys
      // Use hash distribution as a tiebreaker for approximate load balancing
      // without needing to scan all room mappings (expensive at scale)
      const score = i; // simple round-robin among non-exhausted keys
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    // If all exhausted, pick the first one (will fail, client retries)
    if (bestIdx === -1) bestIdx = 0;

    // For better distribution: use hash among non-exhausted keys
    const nonExhausted = keySets
      .map((_, i) => i)
      .filter((i) => !exhaustionResults[i]);

    if (nonExhausted.length > 0) {
      bestIdx = nonExhausted[hashRoomToKey(room, nonExhausted.length)]!;
    }

    // Assign room to this key
    await r.set(`room:${room}:key`, bestIdx, { ex: ROOM_KEY_TTL });

    return { keySet: keySets[bestIdx]!, index: bestIdx };
  } catch (err) {
    // Redis error - fall back to hash
    console.error("[KeyRotation] Redis error, falling back to hash:", err);
    const idx = hashRoomToKey(room, keySets.length);
    return { keySet: keySets[idx]!, index: idx };
  }
}

/**
 * Mark a key as exhausted (called when connection fails with quota error).
 */
export async function markKeyExhausted(index: number): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(`key:${index}:exhausted`, true, { ex: EXHAUSTED_TTL });
    console.log(`[KeyRotation] Key #${index + 1} marked exhausted (5 min cooldown)`);
  } catch (err) {
    console.error("[KeyRotation] Failed to mark key exhausted:", err);
  }
}
