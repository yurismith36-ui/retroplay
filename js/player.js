const gameId = new URLSearchParams(location.search).get("id");
const statusBox = document.querySelector("#player-status");
const stage = document.querySelector("#emulator-stage");
const gameContainer = document.querySelector("#game");
const fullscreenButton = document.querySelector("#fullscreen-button");
const clearMemoryButton = document.querySelector("#clear-player-memory");
const backButton = document.querySelector(".player-back");

let loaderScript = null;
let memoryWasReleased = false;
let cleanupInProgress = false;

const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function showError(message) {
  statusBox.classList.remove("hidden");
  statusBox.innerHTML = `
    <div style="font-size:44px">⚠️</div>
    <p>${message}</p>
    <a href="index.html" class="player-back">VOLTAR AO SITE</a>`;
}

function numericGameId(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) || 1;
}

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function pseudoFullscreenActive() {
  return document.body.classList.contains("retro-pseudo-fullscreen");
}

function updateFullscreenButton() {
  const active = Boolean(fullscreenElement()) || pseudoFullscreenActive();
  fullscreenButton.textContent = active ? "SAIR" : "TELA CHEIA";
  fullscreenButton.setAttribute("aria-pressed", String(active));
}

function refreshEmulatorSize() {
  [80, 260, 620].forEach(delay => {
    window.setTimeout(() => window.dispatchEvent(new Event("resize")), delay);
  });
}

function enterPseudoFullscreen() {
  document.documentElement.classList.add("retro-pseudo-fullscreen");
  document.body.classList.add("retro-pseudo-fullscreen");
  window.scrollTo(0, 0);
  updateFullscreenButton();
  refreshEmulatorSize();
}

function exitPseudoFullscreen() {
  document.documentElement.classList.remove("retro-pseudo-fullscreen");
  document.body.classList.remove("retro-pseudo-fullscreen");
  updateFullscreenButton();
  refreshEmulatorSize();
}

async function enterRealFullscreen() {
  const request = stage.requestFullscreen || stage.webkitRequestFullscreen;
  if (typeof request !== "function") return false;

  try {
    const result = request.call(stage, { navigationUI: "hide" });
    if (result && typeof result.then === "function") await result;

    // Alguns Safaris antigos expõem o método, mas não entram de fato.
    await new Promise(resolve => window.setTimeout(resolve, 180));
    return Boolean(fullscreenElement());
  } catch (error) {
    console.warn("Tela cheia real indisponível.", error);
    return false;
  }
}

async function exitRealFullscreen() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  if (typeof exit !== "function") return;
  const result = exit.call(document);
  if (result && typeof result.then === "function") await result;
}

async function toggleFullscreen() {
  if (pseudoFullscreenActive()) {
    exitPseudoFullscreen();
    return;
  }

  if (fullscreenElement()) {
    await exitRealFullscreen();
    return;
  }

  const entered = await enterRealFullscreen();
  if (!entered) enterPseudoFullscreen();
}

function callEmulatorStopMethod() {
  const emulator = window.EJS_emulator;
  if (!emulator) return;

  for (const methodName of ["exit", "stop", "destroy", "unload"]) {
    try {
      if (typeof emulator[methodName] === "function") {
        emulator[methodName]();
        break;
      }
    } catch (error) {
      console.warn(`Não foi possível executar ${methodName} no emulador.`, error);
    }
  }
}

function releaseMediaElements() {
  document.querySelectorAll("#game audio, #game video").forEach(media => {
    try { media.pause(); } catch (error) {}
    media.removeAttribute("src");
    try { media.load(); } catch (error) {}
  });
}

function clearEJSReferences() {
  const names = [
    "EJS_player", "EJS_core", "EJS_gameUrl", "EJS_biosUrl",
    "EJS_pathtodata", "EJS_gameName", "EJS_gameID", "EJS_emulator",
    "EJS_ready", "EJS_onGameStart", "EJS_onExit"
  ];

  names.forEach(name => {
    try { window[name] = null; } catch (error) {}
    try { delete window[name]; } catch (error) {}
  });
}

async function saveBeforeLeaving() {
  try { await window.RetroPlayAutoSave?.stopAndSave(); } catch (error) { console.warn(error); }
}

function releaseEmulatorMemory(showBlackScreen = true) {
  if (memoryWasReleased || cleanupInProgress) return;
  cleanupInProgress = true;

  callEmulatorStopMethod();
  releaseMediaElements();

  if (loaderScript) {
    loaderScript.remove();
    loaderScript = null;
  }

  gameContainer.replaceChildren();
  clearEJSReferences();
  try { performance.clearResourceTimings(); } catch (error) {}
  try { sessionStorage.removeItem("retroplay-rom-em-memoria"); } catch (error) {}

  if (showBlackScreen) {
    document.body.classList.add("memory-cleared");
    statusBox.classList.add("hidden");
    stage.setAttribute("aria-label", "Memória do jogo limpa");
  }

  memoryWasReleased = true;
  cleanupInProgress = false;
}

async function clearMemoryAndOpenBlackScreen() {
  clearMemoryButton.disabled = true;
  clearMemoryButton.textContent = "SALVANDO...";
  await saveBeforeLeaving();
  releaseEmulatorMemory(true);
  location.replace("limpar.html");
}

async function startPlayer() {
  if (!gameId) {
    showError("Nenhum jogo foi selecionado.");
    return;
  }

  try {
    const response = await fetch("./dados/games.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);

    const games = await response.json();
    const game = games.find(item => item.id === gameId);

    if (!game) {
      showError("Este jogo não foi encontrado no games.json.");
      return;
    }

    document.title = `${game.nome} — RetroPlay`;
    document.querySelector("#player-title").textContent = game.nome;
    document.querySelector("#player-console").textContent = game.console;
    document.querySelector("#player-info-title").textContent = game.nome;
    document.querySelector("#player-description").textContent = game.descricao || "";
    document.querySelector("#player-year").textContent = game.ano || "—";
    document.querySelector("#player-developer").textContent = game.desenvolvedora || "—";
    document.querySelector("#player-genre").textContent = game.genero || game.console;

    const cover = document.querySelector("#player-cover");
    cover.src = game.capa || "";
    cover.alt = `Capa de ${game.nome}`;

    try { sessionStorage.setItem("retroplay-rom-em-memoria", game.id); } catch (error) {}

    window.EJS_player = "#game";
    window.EJS_core = game.core;
    window.EJS_gameUrl = game.rom;
    window.EJS_pathtodata = "https://cdn.emulatorjs.org/stable/data/";
    window.EJS_startOnLoaded = false;
    window.EJS_gameName = game.nome;
    window.EJS_gameID = numericGameId(game.id);
    window.EJS_disableAutoUnload = false;
    window.EJS_fixedSaveInterval = 10000;

    // Cloud 2.2: apenas baixa o estado agora. A restauração acontece depois do jogo iniciar.
    await window.RetroPlayAutoSave?.prepare(game);

    window.EJS_ready = () => {
      statusBox.classList.add("hidden");
      refreshEmulatorSize();
    };

    window.EJS_onGameStart = () => {
      statusBox.classList.add("hidden");
      refreshEmulatorSize();
      window.RetroPlayAutoSave?.start();
    };

    window.EJS_onExit = () => {
      if (!cleanupInProgress) releaseEmulatorMemory(true);
    };

    if (game.bios) window.EJS_biosUrl = game.bios;

    loaderScript = document.createElement("script");
    loaderScript.src = "https://cdn.emulatorjs.org/stable/data/loader.js";
    loaderScript.async = true;
    loaderScript.onload = () => {
      statusBox.classList.add("hidden");
      refreshEmulatorSize();
    };
    loaderScript.onerror = () => showError("Não foi possível carregar o EmulatorJS. Verifique sua internet.");
    document.body.appendChild(loaderScript);
  } catch (error) {
    console.error(error);
    showError("O catálogo não carregou. Verifique o arquivo dados/games.json.");
  }
}

fullscreenButton.addEventListener("click", toggleFullscreen);
clearMemoryButton.addEventListener("click", clearMemoryAndOpenBlackScreen);

backButton.addEventListener("click", async event => {
  event.preventDefault();
  backButton.textContent = "SALVANDO...";
  await saveBeforeLeaving();
  releaseEmulatorMemory(true);
  location.replace("index.html");
});

document.addEventListener("fullscreenchange", () => {
  updateFullscreenButton();
  refreshEmulatorSize();
});

document.addEventListener("webkitfullscreenchange", () => {
  updateFullscreenButton();
  refreshEmulatorSize();
});

window.addEventListener("orientationchange", refreshEmulatorSize);
window.addEventListener("resize", updateFullscreenButton);
if (window.visualViewport) window.visualViewport.addEventListener("resize", refreshEmulatorSize);

window.addEventListener("pagehide", () => releaseEmulatorMemory(false));
window.addEventListener("beforeunload", () => releaseEmulatorMemory(false));

window.addEventListener("pageshow", event => {
  if (event.persisted && memoryWasReleased) location.replace("index.html");
});

updateFullscreenButton();
startPlayer();
