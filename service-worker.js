const CACHE_VERSION = "retroplay-naya-0-4-3-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./comunidade.html",
  "./salas.html",
  "./arena-player.html",
  "./css/style.css?v=auth-1-0",
  "./css/comunidade.css?v=community-1-0",
  "./css/comunidade-preview.css?v=community-1-0",
  "./css/arena.css?v=arena-2-0-2",
  "./css/arena-player.css?v=naya-0-4-3",
  "./js/boot.js?v=performance-2-1",
  "./js/app.js?v=auth-1-0",
  "./js/comunidade.js?v=community-1-0",
  "./js/console-corner.js?v=performance-2-1",
  "./js/arena-config.js?v=arena-2-0-2",
  "./js/salas.js?v=arena-2-0-2",
  "./js/arena-player.js?v=naya-0-4-3",
  "./login.html",
  "./conta.html",
  "./js/supabase.js?v=auth-1-0",
  "./js/auth.js?v=auth-1-0",
  "./js/cloud.js?v=auth-1-0",
  "./dados/games.json",
  "./assets/icone-controle.svg",
  "./assets/controle-retro.svg"
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
  const isScriptOrStyle = request.destination === "script" || request.destination === "style";
  const isImage = request.destination === "image";

  if (isNavigation || isCatalog || isScriptOrStyle) {
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
    if (response.ok) cache.put(request, response.clone());
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
