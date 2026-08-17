// The `/cloudflare` entry, not the default one, because the default sets
// `cache: "no-store"` on every fetch and workerd rejects that under our
// compatibility date ("Unsupported cache mode"), which silently turned every
// Redis call on the worker into the no-Redis fallback. It is a plain fetch client
// with no Cloudflare globals, so Node runs it too, and the REST calls are POSTs
// that Next's data cache never touched anyway.
import { Redis } from "@upstash/redis/cloudflare";
import type { EnvReader } from "./env";

export type RedisClient = Redis;

// One instance per isolate. Key rotation and the search cache share it rather than
// opening two.
let cached: Redis | null = null;

export function getRedis(env: EnvReader): Redis | null {
  if (cached) return cached;
  const url = env("UPSTASH_REDIS_REST_URL");
  const token = env("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) return null;
  cached = new Redis({ url, token });
  return cached;
}
