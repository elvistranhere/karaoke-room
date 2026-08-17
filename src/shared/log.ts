// The logging core both runtimes share, and the only file in the repo allowed to touch
// `console` (biome enforces it). It holds no state that outlives a call: `src/shared/` is
// bundled into the PartyKit worker and the Next server, where a module-global is shared
// by every user and every room, so nothing here retains a message.
//
// `src/lib/logger.ts` wraps it for the browser (the `karaoke-debug` gate and the analytics
// error sink) and `party/log.ts` wraps it for the worker (the `PARTY_DEBUG` gate).

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug: (message: string, ...details: unknown[]) => void;
  info: (message: string, ...details: unknown[]) => void;
  warn: (message: string, ...details: unknown[]) => void;
  error: (message: string, ...details: unknown[]) => void;
}

export interface LoggerBehaviour {
  /** Warn and error should always answer true: a broken mic has to leave a trace. */
  shouldPrint: (level: LogLevel) => boolean;
  onEmit?: (level: LogLevel, namespace: string, message: string, details: unknown[]) => void;
}

let debugLogging = initialDebugLogging();

// A Durable Object has no `process.env`, so the deployed worker arms the gate through
// `configurePartyLog(room.env)`. This only opens it where a real env exists: `PARTY_DEBUG`
// on a Node process, which is what makes `npm run dev` and a local script verbose.
function initialDebugLogging(): boolean {
  if (typeof process === "undefined" || !process.env) return false;
  const raw = process.env.PARTY_DEBUG;
  return raw === "1" || raw === "true";
}

export function setDebugLogging(enabled: boolean): void {
  debugLogging = enabled;
}

export function isDebugLoggingEnabled(): boolean {
  return debugLogging;
}

export function createNamespacedLogger(namespace: string, behaviour: LoggerBehaviour): Logger {
  const emit = (level: LogLevel, message: string, details: unknown[]): void => {
    behaviour.onEmit?.(level, namespace, message, details);
    if (!behaviour.shouldPrint(level)) return;
    const tag = `[${namespace}]`;
    if (level === "error") console.error(tag, message, ...details);
    else if (level === "warn") console.warn(tag, message, ...details);
    else console.log(tag, message, ...details);
  };

  return {
    debug: (message, ...details) => emit("debug", message, details),
    info: (message, ...details) => emit("info", message, details),
    warn: (message, ...details) => emit("warn", message, details),
    error: (message, ...details) => emit("error", message, details),
  };
}

/**
 * For dual-runtime modules under `src/shared/`. Debug and info are closed until the host
 * runtime arms the gate, so a worker whose `NODE_ENV` is empty stays quiet.
 */
export function createSharedLogger(namespace: string): Logger {
  return createNamespacedLogger(namespace, {
    shouldPrint: (level) => level === "warn" || level === "error" || debugLogging,
  });
}
