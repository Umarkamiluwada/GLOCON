const CACHE_NAME = "glocon-cache-v2";
const CORE_ASSETS = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./i18n.js",
  "./manifest.webmanifest",
  "./icon-192-2.png",
  "./icon-512-3.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Never cache Supabase API calls — always go to network for live data
  if (event.request.url.includes("supabase.co")) return;

  // Network-first for our own app files: always try to fetch the latest
  // version first, and only fall back to the cached copy if there's no
  // internet connection. This means every future update you upload takes
  // effect immediately — no more stuck-on-old-version problem.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
