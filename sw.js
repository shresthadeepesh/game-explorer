// Service worker. The app shell and dataset are precached so a reload is
// instant and offline; cover art is cached as it is seen, because a couple of
// hundred images have no business being fetched up front.

const VERSION = "v3";
const SHELL = `shell-${VERSION}`;
const DATA = `data-${VERSION}`;
const ART = `art-${VERSION}`;
const KEEP = new Set([SHELL, DATA, ART]);

const SHELL_FILES = [
  "./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-maskable.svg",
  "./src/styles.css",
  "./src/app.js", "./src/panel.js", "./src/mylist.js", "./src/listview.js",
  "./src/store.js", "./src/catalog.js", "./src/recommend.js",
  "./src/timeline.js", "./src/graph.js", "./src/art.js",
  "./src/categories.js", "./src/a11y.js", "./src/util.js", "./src/url.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // one bad path must not fail the whole install
    await Promise.allSettled(SHELL_FILES.map((file) => cache.add(file)));
    const data = await caches.open(DATA);
    await Promise.allSettled(["./data/games.json", "./data/catalog/index.json"].map((f) => data.add(f)));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (!KEEP.has(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

const cacheFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
};

// Serve what we have, refresh in the background for next time.
const staleWhileRevalidate = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const network = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => hit);
  return hit || network;
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;     // fonts and covers on other hosts stay untouched

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("./index.html")));
    return;
  }
  if (url.pathname.includes("/assets/covers/")) {
    event.respondWith(cacheFirst(request, ART));
    return;
  }
  if (url.pathname.endsWith(".json")) {
    event.respondWith(staleWhileRevalidate(request, DATA));
    return;
  }
  event.respondWith(staleWhileRevalidate(request, SHELL));
});
