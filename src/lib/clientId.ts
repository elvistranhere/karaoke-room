const STORAGE_KEY = "karaoke-client-id";

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Stable per-browser identity used for admin reclaim and kick bans. Null if storage is blocked. */
export function getClientId(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing.slice(0, 64);
    const created = createId();
    localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    return null;
  }
}
