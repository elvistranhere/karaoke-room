// The worker's half of the logging rule (the client's is src/lib/logger.ts, and the
// console call itself lives in src/shared/log.ts, the one file biome lets name `console`).
// Server logs land in Cloudflare's tail, where a running commentary is noise and cost, so
// debug and info are gated on the PARTY_DEBUG env var while warn and error always emit.
//
// The gate is a module variable rather than a read of `process.env`, which a Durable
// Object does not have: `configurePartyLog(this.room.env)` in `onStart` is what arms it,
// and it arms the same gate the `src/shared/` modules log through.
import {
  createSharedLogger,
  isDebugLoggingEnabled,
  setDebugLogging,
  type Logger,
} from "../src/shared/log";

export type PartyLogger = Logger;

export function configurePartyLog(env: unknown): void {
  const raw = (env as Record<string, unknown> | null | undefined)?.PARTY_DEBUG;
  setDebugLogging(raw === "1" || raw === "true");
}

export function isPartyDebugEnabled(): boolean {
  return isDebugLoggingEnabled();
}

export function createPartyLogger(namespace: string): PartyLogger {
  return createSharedLogger(namespace);
}
