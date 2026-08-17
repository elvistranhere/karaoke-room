import { afterEach, describe, expect, it, vi } from "vitest";

type SharedLogModule = typeof import("./log");

// The gate is a module variable, so every case loads its own copy of the module.
async function loadLog(): Promise<SharedLogModule> {
  vi.resetModules();
  return await import("./log");
}

afterEach(() => {
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

describe("createSharedLogger", () => {
  it("keeps debug and info closed until the runtime arms the gate", async () => {
    vi.stubEnv("PARTY_DEBUG", "");
    vi.stubEnv("NODE_ENV", "development");
    const { createSharedLogger } = await loadLog();
    const spies = spyOnConsole();
    const log = createSharedLogger("KeyRotation");
    log.debug("d");
    log.info("i");
    expect(spies.log).not.toHaveBeenCalled();
  });

  it("always emits warn and error, gate or no gate", async () => {
    vi.stubEnv("PARTY_DEBUG", "");
    const { createSharedLogger } = await loadLog();
    const spies = spyOnConsole();
    const log = createSharedLogger("KeyRotation");
    log.warn("w");
    log.error("e");
    expect(spies.warn).toHaveBeenCalledWith("[KeyRotation]", "w");
    expect(spies.error).toHaveBeenCalledWith("[KeyRotation]", "e");
  });

  it("opens debug and info once the gate is armed", async () => {
    vi.stubEnv("PARTY_DEBUG", "");
    const { createSharedLogger, setDebugLogging, isDebugLoggingEnabled } = await loadLog();
    const spies = spyOnConsole();
    const log = createSharedLogger("Token");
    setDebugLogging(true);
    expect(isDebugLoggingEnabled()).toBe(true);
    log.debug("d", { room: "ABC123" });
    expect(spies.log).toHaveBeenCalledWith("[Token]", "d", { room: "ABC123" });
  });

  it("reads PARTY_DEBUG where a real process env exists", async () => {
    vi.stubEnv("PARTY_DEBUG", "1");
    const { isDebugLoggingEnabled } = await loadLog();
    expect(isDebugLoggingEnabled()).toBe(true);
  });
});

describe("createNamespacedLogger", () => {
  it("reports every level to onEmit, printed or not", async () => {
    const { createNamespacedLogger } = await loadLog();
    spyOnConsole();
    const seen: string[] = [];
    const log = createNamespacedLogger("LiveKit", {
      shouldPrint: () => false,
      onEmit: (level, namespace, message) => seen.push(`${level}:${namespace}:${message}`),
    });
    log.debug("d");
    log.error("e");
    expect(seen).toEqual(["debug:LiveKit:d", "error:LiveKit:e"]);
  });
});
