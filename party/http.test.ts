import { describe, expect, it } from "vitest";
import type * as Party from "partykit/server";
import { corsFor, rateBucketFor, RateLimiter } from "./http";

const DEPLOYED = "https://karaoke-room.elvistranhere.partykit.dev/parties/token/ABC234";
const LOCAL = "http://localhost:1999/parties/token/ABC234";

function request(url: string, headers: Record<string, string> = {}): Party.Request {
  return new Request(url, { headers }) as unknown as Party.Request;
}

describe("corsFor", () => {
  it("refuses a browser origin on a deployed host when the allowlist is unset", () => {
    const decision = corsFor(request(DEPLOYED, { Origin: "https://evil.example" }), {});
    expect(decision.allowed).toBe(false);
    // The refusal is readable on purpose: the body is one fixed string, and without the
    // header the browser reports an opaque network error instead of the reason.
    expect(decision.headers["Access-Control-Allow-Origin"]).toBe("https://evil.example");
  });

  it("reflects an origin on a dev host when the allowlist is unset", () => {
    const decision = corsFor(request(LOCAL, { Origin: "http://localhost:3000" }), {});
    expect(decision.allowed).toBe(true);
    expect(decision.headers["Access-Control-Allow-Origin"]).toBe("http://localhost:3000");
  });

  it("allows a request with no Origin and sends no ACAO header", () => {
    const decision = corsFor(request(DEPLOYED), { PARTY_ALLOWED_ORIGINS: "https://app.example" });
    expect(decision.allowed).toBe(true);
    expect(decision.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("allows an origin on the allowlist and refuses one that is not", () => {
    const env = { PARTY_ALLOWED_ORIGINS: "https://app.example, https://other.example" };
    expect(corsFor(request(DEPLOYED, { Origin: "https://app.example" }), env).allowed).toBe(true);
    expect(corsFor(request(DEPLOYED, { Origin: "https://nope.example" }), env).allowed).toBe(false);
  });

  it("normalizes case and a trailing slash on both sides", () => {
    const env = { PARTY_ALLOWED_ORIGINS: "https://Karaoke-Room.vercel.app/" };
    expect(corsFor(request(DEPLOYED, { Origin: "https://karaoke-room.vercel.app" }), env).allowed).toBe(true);
    expect(corsFor(request(DEPLOYED, { Origin: "https://karaoke-room.vercel.app/" }), env).allowed).toBe(true);
  });

  it("matches a wildcard entry one label deep only", () => {
    const env = { PARTY_ALLOWED_ORIGINS: "https://*.vercel.app" };
    const allowed = (origin: string) => corsFor(request(DEPLOYED, { Origin: origin }), env).allowed;
    expect(allowed("https://karaoke-now-git-fix-elvis.vercel.app")).toBe(true);
    expect(allowed("https://a.b.vercel.app")).toBe(false);
    expect(allowed("http://karaoke-room.vercel.app")).toBe(false);
    expect(allowed("https://evil-vercel.app")).toBe(false);
  });

  it("refuses the null origin a sandboxed iframe sends", () => {
    expect(corsFor(request(DEPLOYED, { Origin: "null" }), {}).allowed).toBe(false);
    const env = { PARTY_ALLOWED_ORIGINS: "https://app.example" };
    expect(corsFor(request(DEPLOYED, { Origin: "null" }), env).allowed).toBe(false);
  });
});

describe("rateBucketFor", () => {
  it("keys on the edge-injected address", () => {
    expect(rateBucketFor(request(DEPLOYED, { "CF-Connecting-IP": "8.8.8.8" }))).toBe("ip:8.8.8.8");
  });

  it("ignores a caller-supplied X-Forwarded-For", () => {
    const bucket = rateBucketFor(request(DEPLOYED, { "X-Forwarded-For": "9.9.9.1, 8.8.8.8" }));
    expect(bucket).toBe("untrusted");
    expect(rateBucketFor(request(DEPLOYED, { "X-Forwarded-For": "9.9.9.2" }))).toBe(bucket);
  });

  it("does not limit at all on a dev host, where every request looks identical", () => {
    expect(rateBucketFor(request(LOCAL))).toBeNull();
    expect(rateBucketFor(request(LOCAL, { "CF-Connecting-IP": "8.8.8.8" }))).toBe("ip:8.8.8.8");
  });
});

describe("RateLimiter", () => {
  it("allows up to the limit and refuses the next one", () => {
    const limiter = new RateLimiter(3, 60_000);
    expect(limiter.take("a", 0)).toBe(true);
    expect(limiter.take("a", 1)).toBe(true);
    expect(limiter.take("a", 2)).toBe(true);
    expect(limiter.take("a", 3)).toBe(false);
  });

  it("counts each bucket separately", () => {
    const limiter = new RateLimiter(1, 60_000);
    expect(limiter.take("a", 0)).toBe(true);
    expect(limiter.take("b", 0)).toBe(true);
    expect(limiter.take("a", 0)).toBe(false);
  });

  it("opens a fresh window once the old one has expired", () => {
    const limiter = new RateLimiter(2, 60_000);
    expect(limiter.take("a", 0)).toBe(true);
    expect(limiter.take("a", 0)).toBe(true);
    expect(limiter.take("a", 59_999)).toBe(false);
    expect(limiter.take("a", 60_000)).toBe(true);
    expect(limiter.take("a", 60_001)).toBe(true);
    expect(limiter.take("a", 60_002)).toBe(false);
  });
});
