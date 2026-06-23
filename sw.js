const CACHE_NAME = "rnco-fundtracker-v4";
const ASSETS = ["./", "./index.html", "./app.jsx", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
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

// Network-first for same-origin app files (index.html/app.jsx/manifest), so a
// new deploy is picked up on the very next load instead of waiting for a
// cache-name bump. Falls back to the cached copy only when offline.
// Cross-origin requests (Fintual/mindicador APIs, data/funds.json with its
// own cache-busting) are left to the network entirely — never cached here.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isAppShell = url.origin === location.origin && ASSETS.some((a) => url.pathname.endsWith(a.replace("./", "")) || a === "./");

  if (!isAppShell) return; // let the browser handle it normally, no SW interception

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
