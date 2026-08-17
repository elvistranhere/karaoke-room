import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AnalyticsModule = typeof import("./analytics");

const store = new Map<string, string>();

// One fake vendor for the whole file. `initAnalytics` reaches it through the dynamic
// `import("posthog-js")`, so this is the real path an event takes.
const vendor = {
  init: vi.fn<(key: string, config: Record<string, unknown>) => void>(),
  capture: vi.fn<(event: string, props?: Record<string, unknown>) => void>(),
};

vi.mock("posthog-js", () => ({ default: vendor }));

async function loadAnalytics(): Promise<AnalyticsModule> {
  vi.resetModules();
  return await import("./analytics");
}

/** Waits for the dynamic import inside `initAnalytics` to settle. */
async function settle(): Promise<void> {
  await import("posthog-js");
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  store.clear();
  vendor.init.mockClear();
  vendor.capture.mockClear();
  vi.stubGlobal("navigator", { doNotTrack: null });
  vi.stubGlobal("window", {
    doNotTrack: null,
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
    },
    location: { search: "" },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("chatLengthBucket", () => {
  it("buckets by length and never by content", async () => {
    const { chatLengthBucket } = await loadAnalytics();
    expect(chatLengthBucket(0)).toBe("short");
    expect(chatLengthBucket(20)).toBe("short");
    expect(chatLengthBucket(21)).toBe("medium");
    expect(chatLengthBucket(80)).toBe("medium");
    expect(chatLengthBucket(81)).toBe("long");
  });
});

describe("markRoomVisited", () => {
  it("reports the first visit as new and the next one as a rejoin", async () => {
    const { markRoomVisited } = await loadAnalytics();
    expect(markRoomVisited("ABC123")).toBe(false);
    expect(markRoomVisited("ABC123")).toBe(true);
    expect(markRoomVisited("abc123")).toBe(true);
    expect(markRoomVisited("ZZZ999")).toBe(false);
  });

  it("stores a marker, never the room code", async () => {
    const { markRoomVisited } = await loadAnalytics();
    markRoomVisited("ABC123");
    const stored = store.get("karaoke-rooms-visited") ?? "";
    expect(stored).not.toContain("ABC123");
    expect(stored).not.toContain("abc123");
    expect(stored.length).toBeGreaterThan(0);
  });

  it("salts the marker per device, so it links nothing across browsers", async () => {
    const { markRoomVisited } = await loadAnalytics();
    markRoomVisited("ABC123");
    const first = store.get("karaoke-rooms-visited");
    store.clear();
    markRoomVisited("ABC123");
    expect(store.get("karaoke-rooms-visited")).not.toBe(first);
  });

  it("keeps at most 20 rooms, oldest dropped first", async () => {
    const { markRoomVisited } = await loadAnalytics();
    for (let i = 0; i < 25; i++) markRoomVisited(`ROOM${i}`);
    expect((store.get("karaoke-rooms-visited") ?? "").split(",")).toHaveLength(20);
    expect(markRoomVisited("ROOM0")).toBe(false);
    expect(markRoomVisited("ROOM24")).toBe(true);
  });
});

describe("track", () => {
  it("is a no-op with no key configured, and never touches the vendor", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const { track, initAnalytics } = await loadAnalytics();
    initAnalytics();
    expect(() => track("room_created")).not.toThrow();
    expect(() => track("chat_sent", { length_bucket: "short" })).not.toThrow();
    expect(store.has("karaoke-device-id")).toBe(false);
  });
});

describe("privacy of what reaches the vendor", () => {
  const ROOM_CODE = "ABC123";

  // The properties posthog-js attaches to every capture from the page's own URL. The
  // capture flags do not touch these, which is why the init config has to.
  function vendorDefaults(): Record<string, unknown> {
    return {
      $current_url: `https://karaoke.example/room/${ROOM_CODE}?name=Alice`,
      $pathname: `/room/${ROOM_CODE}`,
      $host: "karaoke.example",
      $referrer: `https://karaoke.example/room/${ROOM_CODE}`,
      $referring_domain: "karaoke.example",
      $initial_current_url: `https://karaoke.example/room/${ROOM_CODE}?name=Alice`,
      $initial_pathname: `/room/${ROOM_CODE}`,
      $session_entry_url: `https://karaoke.example/room/${ROOM_CODE}`,
      $raw_user_agent: "Mozilla/5.0 (iPhone)",
      $browser: "Mobile Safari",
      $lib: "web",
    };
  }

  async function initWithKey(): Promise<AnalyticsModule> {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key");
    const analytics = await loadAnalytics();
    analytics.initAnalytics();
    await settle();
    return analytics;
  }

  function initConfig(): Record<string, unknown> {
    const call = vendor.init.mock.calls[0];
    if (!call) throw new Error("posthog.init was never called");
    return call[1];
  }

  it("denies the URL and referrer properties the room code rides on", async () => {
    await initWithKey();
    const denylist = initConfig().property_denylist as string[];
    for (const key of Object.keys(vendorDefaults())) {
      if (key === "$browser" || key === "$lib") continue;
      expect(denylist).toContain(key);
    }
  });

  it("sends no room code on any event, defaults included", async () => {
    const { track } = await initWithKey();
    const denylist = initConfig().property_denylist as string[];
    const sanitize = initConfig().sanitize_properties as (
      props: Record<string, unknown>,
      event: string,
    ) => Record<string, unknown>;

    track("room_joined", { role: "creator", rejoin: false });
    track("chat_sent", { length_bucket: "short" });
    track("app_error", { namespace: "LiveKit", message: "Mic error" });

    expect(vendor.capture).toHaveBeenCalledTimes(3);
    for (const [event, props] of vendor.capture.mock.calls) {
      // The vendor builds its defaults, runs the sanitizer, then drops the denylist.
      const built = sanitize({ ...vendorDefaults(), ...(props ?? {}) }, event);
      for (const key of denylist) delete built[key];
      const payload = JSON.stringify(built);
      expect(payload).not.toContain(ROOM_CODE);
      expect(payload).not.toContain("Alice");
      expect(payload).not.toContain("karaoke.example");
    }
  });

  it("drops any URL-valued property, whatever the vendor calls it next", async () => {
    const { sanitizeProperties } = await loadAnalytics();
    const cleaned = sanitizeProperties({
      $some_future_url: `https://karaoke.example/room/${ROOM_CODE}`,
      $screen_width: 390,
      length_bucket: "short",
    });
    expect(cleaned).toEqual({ $screen_width: 390, length_bucket: "short" });
  });

  it("honours Do Not Track: no vendor bundle, no local state", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key");
    vi.stubGlobal("navigator", { doNotTrack: "1" });
    const { initAnalytics, analyticsEnabled, track } = await loadAnalytics();
    initAnalytics();
    await settle();
    track("room_created");
    expect(vendor.init).not.toHaveBeenCalled();
    expect(vendor.capture).not.toHaveBeenCalled();
    expect(analyticsEnabled()).toBe(false);
    expect(store.has("karaoke-device-id")).toBe(false);
    expect(store.has("karaoke-rooms-visited")).toBe(false);
  });

  it("reports disabled with no key, so callers can skip the local work too", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const { analyticsEnabled } = await loadAnalytics();
    expect(analyticsEnabled()).toBe(false);
  });

  it("survives a vendor whose capture throws, because a tap depends on it", async () => {
    const { track } = await initWithKey();
    vendor.capture.mockImplementationOnce(() => { throw new Error("blocked by an extension"); });
    expect(() => track("audio_recover_tapped")).not.toThrow();
  });
});
