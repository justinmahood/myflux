/* Service worker: makes the app installable and lets the shell start
 * offline. Strategy is network-first with cache fallback — fresh code
 * always wins when the network is up, and the last good copy serves
 * when it isn't. The Miniflux API is never intercepted. */

const CACHE = "myflux-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, {
      ignoreSearch: request.mode === "navigate",
    });
    if (cached) return cached;
    if (request.mode === "navigate") {
      const shell = await cache.match("/");
      if (shell) return shell;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/v1/")) return; // Miniflux API (co-hosted setups)
  if (url.pathname.startsWith("/@") ||
      url.pathname.startsWith("/node_modules/")) return; // Vite dev internals
  event.respondWith(networkFirst(event.request));
});
