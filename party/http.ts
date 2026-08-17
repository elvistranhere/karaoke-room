import type * as Party from "partykit/server";
import { createPartyLogger } from "./log";

const log = createPartyLogger("Party");

// Shared hardening for the worker's HTTP endpoints (token minting, YouTube search).
// Read what each control actually covers before relying on it:
//
// - The origin allowlist only decides whether a *browser* may read the response. A
//   request with no `Origin` (native client, `<img src>`, `<script src>`, a top-level
//   navigation) is not gated by it at all, so it is a control against cross-origin
//   credential theft and against nothing else.
// - The per-IP rate limit is therefore the only control on origin-less traffic. It is a
//   burst brake in instance memory, not an accounting system, and it can only be keyed
//   on a header a trusted edge injects.
// - Anything that has to hold against a determined caller (YouTube quota, LiveKit key
//   rotation state) carries its own budget in Redis, in `src/shared/`.

const ALLOW_ORIGINS_VAR = "PARTY_ALLOWED_ORIGINS";
const DEV_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

export interface CorsDecision {
  allowed: boolean;
  headers: Record<string, string>;
}

// A config typo must not black-hole the app, so case and a trailing slash are
// normalized away on both sides of the comparison.
function normalizeOrigin(value: string): string {
  return value.trim().toLowerCase().replace(/\/+$/, "");
}

function parseAllowlist(env: Record<string, unknown>): string[] {
  const raw = env[ALLOW_ORIGINS_VAR];
  if (typeof raw !== "string") return [];
  return raw.split(",").map(normalizeOrigin).filter(Boolean);
}

// `https://*.vercel.app` matches one label deep, so preview deployments (whose per-deploy
// origin cannot be enumerated) are expressible without opening the list to everything.
function originMatches(allowlist: string[], origin: string): boolean {
  return allowlist.some((entry) => {
    if (!entry.includes("*")) return entry === origin;
    const [scheme, host] = entry.split("://");
    if (!scheme || !host?.startsWith("*.")) return false;
    const prefix = `${scheme}://`;
    const suffix = host.slice(1);
    if (!origin.startsWith(prefix) || !origin.endsWith(suffix)) return false;
    const label = origin.slice(prefix.length, origin.length - suffix.length);
    return label.length > 0 && !label.includes(".") && !label.includes("/");
  });
}

export function isDevHost(req: Party.Request): boolean {
  try {
    return DEV_HOSTNAMES.has(new URL(req.url).hostname);
  } catch {
    return false;
  }
}

/**
 * Fails closed the way `party/registry.ts` does: on a deployed host with no
 * `PARTY_ALLOWED_ORIGINS`, a browser origin is refused rather than reflected, because
 * reflecting it hands any page a readable LiveKit publish credential. Only local dev
 * hostnames reflect an unlisted origin. A request with no `Origin` is still allowed:
 * native clients have none, and the allowlist has no opinion about them (see the header
 * comment - the rate limit is what stands there).
 */
export function corsFor(req: Party.Request, env: Record<string, unknown>): CorsDecision {
  const raw = req.headers.get("Origin");
  const origin = raw ? normalizeOrigin(raw) : null;
  const allowlist = parseAllowlist(env);

  if (!origin) return { allowed: true, headers: { Vary: "Origin" } };

  if (allowlist.length === 0) {
    if (!isDevHost(req)) {
      log.warn("PARTY_ALLOWED_ORIGINS is not set - rejecting browser origin", origin);
      return { allowed: false, headers: { "Access-Control-Allow-Origin": origin, Vary: "Origin" } };
    }
    return { allowed: true, headers: { "Access-Control-Allow-Origin": origin, Vary: "Origin" } };
  }
  if (!originMatches(allowlist, origin)) {
    // The refusal carries CORS headers on purpose: the body is one fixed string, and
    // without them the browser reports an opaque network error instead of the reason.
    return { allowed: false, headers: { "Access-Control-Allow-Origin": origin, Vary: "Origin" } };
  }
  return { allowed: true, headers: { "Access-Control-Allow-Origin": origin, Vary: "Origin" } };
}

/**
 * The rate-limit bucket, or null for "do not rate limit".
 *
 * `CF-Connecting-IP` is the only client address we trust, because the Cloudflare edge in
 * front of a deployed worker overwrites it. `X-Forwarded-For` is deliberately not a
 * fallback: it is caller-supplied, so one actor would get an unlimited number of buckets
 * by varying it. Without the trusted header a deployed worker buckets everything
 * together rather than letting header-less traffic dilute real per-IP accounting, and
 * `partykit dev` (no edge, so every request looks identical) does not limit at all.
 */
export function rateBucketFor(req: Party.Request): string | null {
  const trusted = req.headers.get("CF-Connecting-IP");
  if (trusted) return `ip:${trusted}`;
  if (isDevHost(req)) return null;
  return "untrusted";
}

/**
 * Fixed-window per-IP counter held in the endpoint's own instance memory. A worker
 * restart or a second instance resets it, which is the accepted trade: this is a
 * burst brake in front of paid quota, not an accounting system.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  take(ip: string, now = Date.now()): boolean {
    const entry = this.hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      this.prune(now);
      this.hits.set(ip, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.limit) return false;
    entry.count++;
    return true;
  }

  private prune(now: number) {
    for (const [ip, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(ip);
    }
  }
}

export function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

export function preflightResponse(headers: Record<string, string>): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      ...headers,
    },
  });
}

export function forbiddenOrigin(headers: Record<string, string>): Response {
  return jsonResponse({ error: "Origin not allowed", reason: "origin-not-allowed" }, 403, headers);
}

// `reason` is what keeps this apart from LiveKit's own capacity 429 on the client: a
// caller that reads a bare 429 as exhaustion retries with `keyHint=next`, and that reports
// a perfectly healthy key as exhausted for every room using it.
export function rateLimited(headers: Record<string, string>, retryAfterS: number): Response {
  return jsonResponse(
    { error: "Too many requests. Please slow down and try again shortly.", reason: "rate-limited" },
    429,
    { "Retry-After": String(retryAfterS), ...headers },
  );
}
