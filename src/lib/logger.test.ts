import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type LoggerModule = typeof import("./logger");

interface Harness {
  store: Map<string, string>;
  search: string;
}

const harness: Harness = { store: new Map(), search: "" };

// The gate is read once per module instance, so every case loads a fresh copy against
// its own fake window. `prefs` reads `window.localStorage`, nothing else does.
async function loadLogger(): Promise<LoggerModule> {
  vi.resetModules();
  return await import("./logger");
}

beforeEach(() => {
  harness.store = new Map();
  harness.search = "";
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => harness.store.get(key) ?? null,
      setItem: (key: string, value: string) => { harness.store.set(key, value); },
    },
    location: { get search() { return harness.search; } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function spyOnConsole() {
  return {
    log: vi.spyOn(console, "log").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };
}

describe("createLogger", () => {
  it("keeps the bracket namespace prefix", async () => {
    const { createLogger } = await loadLogger();
    const spies = spyOnConsole();
    createLogger("LiveKit").warn("Mic error:", 1);
    expect(spies.warn).toHaveBeenCalledWith("[LiveKit]", "Mic error:", 1);
  });

  it("emits every level in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { createLogger } = await loadLogger();
    const spies = spyOnConsole();
    const log = createLogger("LiveKit");
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(spies.log).toHaveBeenCalledTimes(2);
    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.error).toHaveBeenCalledTimes(1);
  });

  it("drops debug and info in production while warn and error still emit", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { createLogger } = await loadLogger();
    const spies = spyOnConsole();
    const log = createLogger("LiveKit");
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.error).toHaveBeenCalledTimes(1);
  });

  it("lets stored karaoke-debug reopen debug and info in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    harness.store.set("karaoke-debug", "1");
    const { createLogger } = await loadLogger();
    const spies = spyOnConsole();
    createLogger("Sync").debug("d");
    expect(spies.log).toHaveBeenCalledWith("[Sync]", "d");
  });

  it("opens the gate from ?debug and persists it", async () => {
    vi.stubEnv("NODE_ENV", "production");
    harness.search = "?debug";
    const { createLogger } = await loadLogger();
    const spies = spyOnConsole();
    createLogger("Sync").debug("d");
    expect(spies.log).toHaveBeenCalledTimes(1);
    expect(harness.store.get("karaoke-debug")).toBe("1");
  });

  it("closes the gate from ?debug=0 and persists that too", async () => {
    vi.stubEnv("NODE_ENV", "production");
    harness.store.set("karaoke-debug", "1");
    harness.search = "?debug=0";
    const { createLogger } = await loadLogger();
    const spies = spyOnConsole();
    createLogger("Sync").debug("d");
    expect(spies.log).not.toHaveBeenCalled();
    expect(harness.store.get("karaoke-debug")).toBe("0");
  });

  it("survives storage that throws", async () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => { throw new Error("blocked"); },
        setItem: () => { throw new Error("blocked"); },
      },
      location: { search: "" },
    });
    vi.stubEnv("NODE_ENV", "production");
    const { createLogger } = await loadLogger();
    const spies = spyOnConsole();
    expect(() => createLogger("Sync").debug("d")).not.toThrow();
    expect(spies.log).not.toHaveBeenCalled();
  });

  it("routes error logs to the registered sink, suppressed output included", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { createLogger, setLogErrorSink } = await loadLogger();
    spyOnConsole();
    const seen: string[] = [];
    setLogErrorSink((entry) => seen.push(`${entry.namespace}:${entry.message}`));
    const log = createLogger("LiveKit");
    log.debug("quiet");
    log.error("Mic error:", new Error("boom"));
    expect(seen).toEqual(["LiveKit:Mic error:"]);
  });

  it("keeps logging when the sink throws", async () => {
    const { createLogger, setLogErrorSink } = await loadLogger();
    const spies = spyOnConsole();
    setLogErrorSink(() => { throw new Error("sink is down"); });
    expect(() => createLogger("LiveKit").error("e")).not.toThrow();
    expect(spies.error).toHaveBeenCalledTimes(1);
  });
});
