const CACHE = "pulse-desk-v1";
const OFFLINE_ASSETS = ["/", "/index.html", "/styles.css", "/app.js", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    fetch(req)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return response;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/index.html")))
  );
});