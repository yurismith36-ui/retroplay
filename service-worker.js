const CACHE_VERSION = "retroplay-performance-2-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css?v=performance-2",
  "./js/boot.js?v=performance-2",
  "./js/app.js?v=performance-2",
  "./js/console-corner.js?v=performance-2",
  "./dados/games.json",
  "./assets/icone-controle.svg",
  "./assets/controle-retro.svg",
  "./assets/console-retro.svg",
  "./imagens/backgrounds/galaxia.webp",
  "./imagens/backgrounds/locadora-moderna.webp",
  "./imagens/backgrounds/locadora-vintage.webp"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => !key.startsWith(CACHE_VERSION)).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === "navigate";
  const isCatalog = url.pathname.endsWith("/dados/games.json");
  const isImage = request.destination === "image";

  if (isNavigation || isCatalog) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isImage) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await caches.match(request)) || (await caches.match("./index.html"));
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || network;
}
