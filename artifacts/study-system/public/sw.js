// AI Study System — minimal offline-first service worker.
// Caches the app shell (HTML/CSS/JS/icons) so the UI loads when offline.
// Never caches /api/* requests — those always go to the network so AI/auth/payments stay live.

const CACHE_VERSION = "ai-study-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never intercept API, auth, or upload traffic — always live network.
  if (url.pathname.includes("/api/")) return;

  // Don't try to cache cross-origin (fonts CDN etc.) — let the browser handle it.
  if (url.origin !== self.location.origin) return;

  // For navigations, try network first, fall back to cached index.html (offline shell).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./index.html").then((r) => r || Response.error())),
    );
    return;
  }

  // For static assets, cache-first with network fallback that fills the cache.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || Response.error());
    }),
  );
});
