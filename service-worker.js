const CACHE_VERSION = "retroplay-ios-nfc-1-0";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./comunidade.html",
  "./salas.html",
  "./arena-player.html",
  "./css/style.css?v=auth-1-0",
  "./css/player-isolated.css?v=handheld-skins-2-2-menu-cristal",
  "./css/comunidade.css?v=community-1-0",
  "./css/comunidade-preview.css?v=community-1-0",
  "./css/arena.css?v=arena-2-0-2",
  "./css/arena-player.css?v=naya-0-4-9-ui-safe",
  "./js/boot.js?v=performance-2-1",
  "./js/app.js?v=auth-1-0",
  "./js/comunidade.js?v=community-1-0",
  "./js/console-corner.js?v=performance-2-1",
  "./js/arena-config.js?v=arena-2-0-2",
  "./js/salas.js?v=arena-2-0-2",
  "./js/arena-player.js?v=naya-restore-base10-v1",
  "./login.html",
  "./conta.html",
  "./player.html",
  "./css/conta.css?v=account-2-0",
  "./js/supabase.js?v=auth-1-0",
  "./js/auth.js?v=auth-1-0",
  "./js/cloud.js?v=auth-1-0",
  "./js/stats.js?v=account-2-0",
  "./js/conta.js?v=account-2-0",
  "./js/player.js?v=ios-nfc-1-0",
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
  const isRom = /\.(?:nes|sfc|smc|gb|gbc|gba|z64|n64|v64|zip|7z)$/i.test(url.pathname);
  const isRangeRequest = request.headers.has("range");

  // ROMs e requisições parciais nunca passam pelo Cache Storage.
  // O servidor recebe o cabeçalho Range original e devolve os bytes corretos.
  if (isRom || isRangeRequest) {
    const directRequest = new Request(request, { cache: "no-store" });
    event.respondWith(fetch(directRequest));
    return;
  }

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
    if (response.status === 200) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    return (await caches.match(request)) || (await caches.match("./index.html"));
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then(response => {
    if (response.status === 200) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  }).catch(() => cached);
  return cached || network;
}
