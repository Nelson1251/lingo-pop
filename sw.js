/* Lingo Pop service worker: cache the app shell so it opens offline. */
var CACHE = "lingo-pop-shell-v5";
var SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=17",
  "./app.js?v=26",
  "./phrase-gloss.js?v=8",
  "./clips.json?v=13",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache Stripe or cross-origin.
  if (url.pathname.indexOf("/media/") !== -1) {
    // Media: network first, fall back to cache if any.
    event.respondWith(
      fetch(req).then(function (res) {
        return res;
      }).catch(function () {
        return caches.match(req);
      })
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        // Cache successful same-origin GETs for next time.
        if (res && res.ok && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      });
    })
  );
});
