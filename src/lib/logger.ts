// The browser half of the logging rule. Every module logs through a namespaced instance,
// so the bracket prefix the app has always printed (`[LiveKit] ...`) survives while
// production stops shipping the running commentary. The console call itself lives in
// `src/shared/log.ts`, which is the only file biome lets name `console`.
//
// Production drops debug and info unless the debug gate is on; warn and error always
// emit, because a user reporting a broken mic still has to leave a trace in their own
// console. Nothing is retained: a suppressed line is gone, not buffered.
import { createNamespacedLogger, type LogLevel, type Logger } from "../shared/log";
import { readPref, writePref } from "./prefs";

export type { LogLevel, Logger };

export interface LogEntry {
  at: number;
  level: LogLevel;
  namespace: string;
  message: string;
  details: unknown[];
}

export const DEBUG_STORAGE_KEY = "karaoke-debug";
const DEBUG_QUERY_PARAM = "debug";
const OFF_VALUES = new Set(["0", "off", "false"]);

let debugGate: boolean | null = null;
let errorSink: ((entry: LogEntry) => void) | null = null;

// Called at the last moment rather than read into a module const: Next inlines the
// comparison in the client bundle, and the Next server build wants the live value.
function isProduction(): boolean {
  if (typeof process === "undefined") return true;
  return process.env.NODE_ENV === "production";
}

function readQueryGate(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const value = new URLSearchParams(window.location.search).get(DEBUG_QUERY_PARAM);
    if (value === null) return null;
    return !OFF_VALUES.has(value.toLowerCase());
  } catch {
    return null;
  }
}

/** True when debug and info are allowed to reach the console in production. */
export function isDebugEnabled(): boolean {
  if (debugGate !== null) return debugGate;
  const fromQuery = readQueryGate();
  if (fromQuery !== null) {
    // `?debug` is a switch, not a session: persisting it means the reload that
    // reproduces the bug still logs, and `?debug=0` turns it back off.
    setDebugEnabled(fromQuery);
    return fromQuery;
  }
  debugGate = readPref(DEBUG_STORAGE_KEY) === "1";
  return debugGate;
}

export function setDebugEnabled(enabled: boolean): void {
  debugGate = enabled;
  writePref(DEBUG_STORAGE_KEY, enabled ? "1" : "0");
}

/**
 * Analytics registers here so an error log also becomes an `app_error` event. Kept as a
 * sink rather than an import so the logger stays dependency-free.
 */
export function setLogErrorSink(sink: ((entry: LogEntry) => void) | null): void {
  errorSink = sink;
}

function shouldPrint(level: LogLevel): boolean {
  if (level === "warn" || level === "error") return true;
  if (!isProduction()) return true;
  return isDebugEnabled();
}

function notifySink(level: LogLevel, namespace: string, message: string, details: unknown[]): void {
  if (level !== "error" || !errorSink) return;
  try {
    errorSink({ at: Date.now(), level, namespace, message, details });
  } catch {
    // A broken sink must never take the log with it
  }
}

export function createLogger(namespace: string): Logger {
  return createNamespacedLogger(namespace, { shouldPrint, onEmit: notifySink });
}
