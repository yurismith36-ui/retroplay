// RetroPlay Arena 2.0 — player isolado com EmulatorJS Netplay beta.
(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  const gameId = params.get("id") || "";
  const roomCode = (params.get("sala") || "").toUpperCase();
  const slot = Number(params.get("slot") || 0);
  const mode = params.get("modo") || "duelo";
  const maxPlayers = Number(params.get("jogadores") || (mode === "multitap4" ? 4 : 2));
  const isHost = params.get("host") === "1";
  const config = window.RETROPLAY_ARENA_CONFIG || {};
  const client = window.retroplaySupabase;

  const el = {
    title: document.querySelector("#arena-player-title"),
    meta: document.querySelector("#arena-player-meta"),
    loading: document.querySelector("#arena-player-loading"),
    loadingTitle: document.querySelector("#arena-loading-title"),
    loadingMessage: document.querySelector("#arena-loading-message"),
    serverDot: document.querySelector("#arena-server-dot"),
    guide: document.querySelector("#arena-guide"),
    guideToggle: document.querySelector("#arena-guide-toggle"),
    hideGuide: document.querySelector("#arena-hide-guide"),
    roomCode: document.querySelector("#arena-room-code"),
    copyCode: document.querySelector("#arena-copy-code"),
    maxPlayers: document.querySelector("#arena-max-players"),
    roleHint: document.querySelector("#arena-role-hint"),
    multitapStep: document.querySelector("#arena-multitap-step"),
    exit: document.querySelector("#arena-exit"),
    end: document.querySelector("#arena-end-match")
  };

  let loader = null;
  let heartbeat = null;
  let user = null;

  function numericGameId(text) {
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
    return Math.abs(hash) || 1;
  }

  function setMessage(title, message, type = "") {
    el.loadingTitle.textContent = title;
    el.loadingMessage.textContent = message;
    el.loadingMessage.className = `arena-player-message${type ? ` ${type}` : ""}`;
    el.serverDot.className = `arena-online-dot${type === "error" ? " error" : type === "ok" ? " ok" : ""}`;
  }

  async function copyCode() {
    try { await navigator.clipboard.writeText(roomCode); }
    catch (_error) {
      const input = document.createElement("textarea");
      input.value = roomCode;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    el.copyCode.textContent = "COPIADO";
    setTimeout(() => { el.copyCode.textContent = "COPIAR"; }, 1400);
  }

  function toggleGuide(force) {
    const hidden = typeof force === "boolean" ? !force : !el.guide.classList.contains("hidden");
    el.guide.classList.toggle("hidden", hidden);
    el.guideToggle.setAttribute("aria-expanded", String(!hidden));
  }

  async function serverHealth(gameNumericId) {
    const base = String(config.netplayServer || "").replace(/\/$/, "");
    if (!base) throw new Error("Servidor de netplay não configurado.");
    const url = `${base}/list?domain=${encodeURIComponent(location.hostname)}&game_id=${encodeURIComponent(gameNumericId)}`;
    const response = await fetch(url, { cache: "no-store", mode: "cors" });
    if (!response.ok) throw new Error(`Servidor respondeu ${response.status}.`);
    return true;
  }

  async function getUser() {
    const { data } = await client.auth.getSession();
    user = data?.session?.user || null;
    return user;
  }

  async function heartbeatRoom() {
    if (!client || !user || !roomCode) return;
    try { await client.rpc("arena_heartbeat", { p_code: roomCode }); } catch (_error) {}
  }

  async function endAndExit() {
    if (!confirm(isHost ? "Encerrar a sala para todos e sair?" : "Sair desta partida?")) return;
    try { if (client && user) await client.rpc("arena_leave_room", { p_code: roomCode }); } catch (_error) {}
    cleanup();
    location.replace("salas.html");
  }

  function cleanup() {
    clearInterval(heartbeat);
    try {
      const emulator = window.EJS_emulator;
      for (const method of ["exit", "stop", "destroy", "unload"]) {
        if (typeof emulator?.[method] === "function") { emulator[method](); break; }
      }
    } catch (_error) {}
    loader?.remove();
    loader = null;
  }

  function tryEnableMultitap() {
    try {
      const emulator = window.EJS_emulator;
      const manager = emulator?.gameManager;
      const info = manager?.getControllerPortInfo?.() || "";
      let deviceId = 257;
      for (const line of String(info).split("\n")) {
        const parts = line.split(":");
        if (parts.length < 3) continue;
        const port = Number(parts[0]);
        const id = Number(parts[1]);
        const description = parts.slice(2).join(":");
        if (port === 1 && /multitap/i.test(description)) {
          deviceId = id;
          break;
        }
      }
      manager?.setControllerPortDevice?.(1, deviceId);
      emulator?.changeSettingOption?.("controller-port-device-p2", String(deviceId), true);
    } catch (error) {
      console.warn("Não foi possível ativar o Multitap automaticamente:", error);
    }
  }

  async function start() {
    el.roomCode.textContent = roomCode || "------";
    el.maxPlayers.textContent = String(maxPlayers);
    el.roleHint.textContent = isHost
      ? "Você é o dono: crie a sala dentro do menu Netplay."
      : "Você é convidado: aguarde o dono criar a sala e depois entre nela.";
    el.multitapStep.hidden = mode !== "multitap4";
    if (!gameId || !roomCode) {
      setMessage("Convite incompleto", "Volte à Arena e abra a partida novamente.", "error");
      return;
    }

    await getUser();
    heartbeatRoom();
    heartbeat = setInterval(heartbeatRoom, 20000);

    const response = await fetch("./dados/games.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível carregar o catálogo.");
    const games = await response.json();
    const game = games.find(item => item.id === gameId);
    if (!game) throw new Error("Jogo da sala não encontrado.");

    const gameNumericId = numericGameId(`${game.id}:${game.rom}`);
    document.title = `${game.nome} — RetroPlay Arena`;
    el.title.textContent = game.nome;
    el.meta.textContent = `Sala ${roomCode} • P${slot || "?"} • ${maxPlayers} jogadores`;

    serverHealth(gameNumericId)
      .then(() => setMessage("Servidor online", "Carregando o jogo. Depois use o ícone 🌐 para conectar.", "ok"))
      .catch(error => setMessage("Netplay indisponível", `${error.message} O jogo local ainda pode carregar, mas a conexão online não funcionará.`, "error"));

    window.EJS_player = "#game";
    window.EJS_core = game.core;
    window.EJS_gameUrl = game.rom;
    window.EJS_gameName = game.nome;
    window.EJS_gameID = gameNumericId;
    window.EJS_startOnLoaded = false;
    window.EJS_disableAutoUnload = false;
    window.EJS_pathtodata = `https://cdn.emulatorjs.org/${config.emulatorVersion || "4.3.0-pre"}/data/`;
    const netplayUrl = config.netplayServer || "https://netplay.emulatorjs.org/";
    // O loader 4.3.0-pre lê EJS_netplayServer; o módulo também reconhece EJS_netplayUrl.
    window.EJS_netplayServer = netplayUrl;
    window.EJS_netplayUrl = netplayUrl;
    window.EJS_netplayICEServers = Array.isArray(config.iceServers) ? config.iceServers : [];
    window.EJS_defaultOptions = mode === "multitap4" && String(game.core).toLowerCase() === "snes"
      ? { "controller-port-device-p2": "257" }
      : {};
    window.EJS_ready = () => {
      el.loading.classList.add("hidden");
      if (mode === "multitap4") {
        tryEnableMultitap();
      }
      window.dispatchEvent(new Event("resize"));
    };
    window.EJS_onGameStart = () => {
      el.loading.classList.add("hidden");
      window.dispatchEvent(new Event("resize"));
    };
    window.EJS_onExit = () => cleanup();

    loader = document.createElement("script");
    loader.src = `https://cdn.emulatorjs.org/${config.emulatorVersion || "4.3.0-pre"}/data/loader.js`;
    loader.async = true;
    loader.onerror = () => setMessage("Falha ao carregar o emulador", "A versão multiplayer não pôde ser baixada. Verifique a internet.", "error");
    document.body.appendChild(loader);
  }

  el.guideToggle.addEventListener("click", () => toggleGuide());
  el.hideGuide.addEventListener("click", () => toggleGuide(false));
  el.copyCode.addEventListener("click", copyCode);
  el.exit.addEventListener("click", endAndExit);
  el.end.addEventListener("click", endAndExit);
  window.addEventListener("pagehide", cleanup);
  window.addEventListener("beforeunload", cleanup);

  start().catch(error => {
    console.error(error);
    setMessage("Erro ao abrir a partida", error.message || "Falha desconhecida.", "error");
  });
})();
