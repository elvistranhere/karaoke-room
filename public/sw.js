/* Karaoke Now service worker: app shell only.
   Nothing live is ever cached - API routes, PartyKit, LiveKit and YouTube are
   left entirely to the network. */

const VERSION = new URL(self.location.href).searchParams.get("v") ?? "dev";
const CACHE_NAME = `karaoke-shell-${VERSION}`;
const OFFLINE_URL = "/offline";

const SHELL_URLS = [
  "/",
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

// Same-origin paths that must always hit the network.
const NEVER_CACHE_PATHS = ["/api/", "/parties/"];

// Hosts that must never be intercepted even if they are ever proxied same-origin.
const NEVER_CACHE_HOSTS = [
  "partykit.dev",
  "livekit.cloud",
  "youtube.com",
  "youtube-nocookie.com",
  "ytimg.com",
  "googlevideo.com",
];

function isNeverCached(url) {
  if (NEVER_CACHE_PATHS.some((path) => url.pathname.startsWith(path))) return true;
  return NEVER_CACHE_HOSTS.some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`)
  );
}

function isCacheableAsset(url) {
  if (url.pathname.startsWith("/_next/static/")) return true;
  return /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        SHELL_URLS.map((url) => cache.add(new Request(url, { cache: "reload" })).catch(() => {}))
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("karaoke-shell-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") void self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isNeverCached(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            void cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
          return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
      })()
    );
    return;
  }

  if (!isCacheableAsset(url)) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          void cache.put(request, response.clone());
        }
        return response;
      } catch {
        // Offline with an uncached asset: a rejected respondWith would surface as a
        // hard network error, so hand back an empty body the page can survive.
        return new Response("", { status: 504, statusText: "Offline" });
      }
    })()
  );
});
