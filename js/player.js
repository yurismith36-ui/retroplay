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

function buildRomUrl(game) {
  const url = new URL(String(game.rom || ""), document.baseURI);
  const version = String(game.sha256 || game.bytes || game.adicionadoEm || "").trim();
  if (version) url.searchParams.set("retroplay_rom", version.slice(0, 24));
  return url.href;
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

function createGBCMobileSkin() {
  if (document.querySelector(".retro-gbc-skin")) return;

  const stage = document.querySelector("#emulator-stage");
  if (!stage) return;

  const skin = document.createElement("div");
  skin.className = "retro-gbc-skin";
  skin.setAttribute("aria-label", "Controles Game Boy Color");
  skin.innerHTML = `
    <div class="retro-gbc-screen-shell">
      <div class="retro-gbc-screen-inner">
        <div class="retro-gbc-screen-label">RETROPLAY</div>
        <div class="retro-gbc-screen-slot" aria-hidden="true"></div>
      </div>
    </div>
    <div class="retro-gbc-brand">GAME BOY <b>COLOR</b></div>
    <div class="retro-gbc-led" aria-label="Jogo ligado"></div>
    <div class="retro-gbc-controls">
      <div class="retro-gbc-dpad" aria-label="Direcional">
        <button class="retro-gbc-key dpad-up" data-key="ArrowUp" aria-label="Cima">▲</button>
        <button class="retro-gbc-key dpad-left" data-key="ArrowLeft" aria-label="Esquerda">◀</button>
        <div class="dpad-center" aria-hidden="true"></div>
        <button class="retro-gbc-key dpad-right" data-key="ArrowRight" aria-label="Direita">▶</button>
        <button class="retro-gbc-key dpad-down" data-key="ArrowDown" aria-label="Baixo">▼</button>
      </div>
      <div class="retro-gbc-face-buttons" aria-label="Botões de ação">
        <button class="retro-gbc-key retro-gbc-b" data-key="x" aria-label="B">B</button>
        <button class="retro-gbc-key retro-gbc-a" data-key="z" aria-label="A">A</button>
      </div>
    </div>
    <div class="retro-gbc-meta-controls">
      <button class="retro-gbc-key retro-gbc-select" data-key="Shift" aria-label="Select">SELECT</button>
      <button class="retro-gbc-key retro-gbc-start" data-key="Enter" aria-label="Start">START</button>
    </div>
    <div class="retro-gbc-speaker" aria-hidden="true"></div>
  `;
  stage.appendChild(skin);

  const sendKey = (type, key) => {
    const event = new KeyboardEvent(type, {
      key,
      code: key === "ArrowUp" ? "ArrowUp" : key === "ArrowDown" ? "ArrowDown" : key === "ArrowLeft" ? "ArrowLeft" : key === "ArrowRight" ? "ArrowRight" : key === "Enter" ? "Enter" : key === "Shift" ? "ShiftLeft" : key === "z" ? "KeyZ" : "KeyX",
      bubbles: true,
      cancelable: true,
      composed: true,
      repeat: type === "keydown"
    });
    document.dispatchEvent(event);
  };

  skin.querySelectorAll(".retro-gbc-key").forEach(button => {
    const key = button.dataset.key;
    let held = false;
    const down = event => {
      event.preventDefault();
      if (held) return;
      held = true;
      button.classList.add("is-pressed");
      try { button.setPointerCapture?.(event.pointerId); } catch (_) {}
      sendKey("keydown", key);
    };
    const up = event => {
      event.preventDefault();
      if (!held) return;
      held = false;
      button.classList.remove("is-pressed");
      sendKey("keyup", key);
    };
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    button.addEventListener("lostpointercapture", up);
    button.addEventListener("contextmenu", e => e.preventDefault());
  });

  window.addEventListener("blur", () => {
    skin.querySelectorAll(".retro-gbc-key.is-pressed").forEach(button => {
      button.classList.remove("is-pressed");
      sendKey("keyup", button.dataset.key);
    });
  });
}


function createGBAMobileSkin() {
  if (document.querySelector(".retro-gba-skin")) return;

  const stage = document.querySelector("#emulator-stage");
  if (!stage) return;

  const skin = document.createElement("div");
  skin.className = "retro-gba-skin";
  skin.setAttribute("aria-label", "Controles Game Boy Advance");
  skin.innerHTML = `
    <div class="retro-gba-shoulder retro-gba-l" data-key="a" role="button" aria-label="L">L</div>
    <div class="retro-gba-shoulder retro-gba-r" data-key="s" role="button" aria-label="R">R</div>
    <div class="retro-gba-screen-frame">
      <div class="retro-gba-screen-label">GAME BOY ADVANCE</div>
    </div>
    <div class="retro-gba-brand">GAME BOY <b>ADVANCE</b></div>
    <div class="retro-gba-controls">
      <div class="retro-gba-dpad" aria-label="Direcional">
        <button class="retro-gba-key gba-up" data-key="ArrowUp" aria-label="Cima">▲</button>
        <button class="retro-gba-key gba-left" data-key="ArrowLeft" aria-label="Esquerda">◀</button>
        <div class="gba-dpad-center" aria-hidden="true"></div>
        <button class="retro-gba-key gba-right" data-key="ArrowRight" aria-label="Direita">▶</button>
        <button class="retro-gba-key gba-down" data-key="ArrowDown" aria-label="Baixo">▼</button>
      </div>
      <div class="retro-gba-face-buttons" aria-label="Botões de ação">
        <button class="retro-gba-key gba-b" data-key="x" aria-label="B">B</button>
        <button class="retro-gba-key gba-a" data-key="z" aria-label="A">A</button>
      </div>
    </div>
    <div class="retro-gba-meta-controls">
      <button class="retro-gba-key gba-select" data-key="Shift" aria-label="Select">SELECT</button>
      <button class="retro-gba-key gba-start" data-key="Enter" aria-label="Start">START</button>
    </div>
    <div class="retro-gba-speaker" aria-hidden="true"></div>
    <div class="retro-gba-led" aria-label="Jogo ligado"></div>
  `;
  stage.appendChild(skin);

  const sendKey = (type, key) => {
    const code = key === "ArrowUp" ? "ArrowUp" : key === "ArrowDown" ? "ArrowDown" : key === "ArrowLeft" ? "ArrowLeft" : key === "ArrowRight" ? "ArrowRight" : key === "Enter" ? "Enter" : key === "Shift" ? "ShiftLeft" : key === "z" ? "KeyZ" : key === "x" ? "KeyX" : key === "a" ? "KeyA" : "KeyS";
    document.dispatchEvent(new KeyboardEvent(type, {
      key, code, bubbles: true, cancelable: true, composed: true, repeat: type === "keydown"
    }));
  };

  skin.querySelectorAll(".retro-gba-key, .retro-gba-shoulder").forEach(button => {
    const key = button.dataset.key;
    let held = false;
    const down = event => {
      event.preventDefault();
      if (held) return;
      held = true;
      button.classList.add("is-pressed");
      try { button.setPointerCapture?.(event.pointerId); } catch (_) {}
      sendKey("keydown", key);
    };
    const up = event => {
      event.preventDefault();
      if (!held) return;
      held = false;
      button.classList.remove("is-pressed");
      sendKey("keyup", key);
    };
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    button.addEventListener("lostpointercapture", up);
    button.addEventListener("contextmenu", e => e.preventDefault());
  });

  window.addEventListener("blur", () => {
    skin.querySelectorAll(".is-pressed").forEach(button => {
      button.classList.remove("is-pressed");
      if (button.dataset.key) sendKey("keyup", button.dataset.key);
    });
  });
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

    // Skins de portáteis SOMENTE no celular em retrato. No PC o player permanece tradicional.
    const consoleName = String(game.console || "").toLowerCase();
    const isGBC = consoleName.includes("game boy color");
    const isGBA = consoleName.includes("game boy advance");
    const isPortraitMobile = window.matchMedia("(orientation: portrait) and (max-width: 760px)").matches;
    document.body.classList.toggle("retro-console-gbc", isGBC && isPortraitMobile);
    document.body.classList.toggle("retro-console-gba", isGBA && isPortraitMobile);
    if (isPortraitMobile && isGBC) createGBCMobileSkin();
    if (isPortraitMobile && isGBA) createGBAMobileSkin();
    try { sessionStorage.setItem("retroplay-rom-em-memoria", game.id); } catch (error) {}

    window.EJS_player = "#game";
    window.EJS_core = game.core;
    window.EJS_gameUrl = buildRomUrl(game);
    window.EJS_pathtodata = "https://cdn.emulatorjs.org/stable/data/";
    // No celular vertical iniciamos automaticamente; no PC mantemos o player tradicional com o botão JOGAR.
    window.EJS_startOnLoaded = isPortraitMobile;
    window.EJS_gameName = game.nome;
    window.EJS_gameID = numericGameId(game.id);
    window.EJS_disableAutoUnload = false;
    // N64 Safe Mode: desativa o ciclo interno frequente durante a partida.
    const isN64Game = String(game.core || '').toLowerCase() === 'n64'
      || String(game.console || '').toLowerCase().includes('nintendo 64');
    window.EJS_fixedSaveInterval = isN64Game ? 86400000 : 10000;

    // Cloud 3.1: N64 sem autosave periódico; salva somente ao sair.
    await window.RetroPlayAutoSave?.prepare(game);

    window.EJS_ready = () => {
      statusBox.classList.add("hidden");
      refreshEmulatorSize();
    };

    window.EJS_onGameStart = () => {
      statusBox.classList.add("hidden");
      refreshEmulatorSize();
      window.RetroPlayAutoSave?.start();
      window.RetroPlayStats?.recordGameStarted(game).catch(error => {
        console.warn("Não foi possível registrar o jogo na conta.", error);
      });
      window.dispatchEvent(new CustomEvent("retroplay:emulator-ready"));
    };

    window.EJS_onExit = async () => {
      if (cleanupInProgress) return;
      await saveBeforeLeaving();
      releaseEmulatorMemory(true);
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


// Player isolado: menu compacto para deixar somente o jogo visível.
const isolatedMenuToggle = document.querySelector("#isolated-menu-toggle");
const isolatedActions = document.querySelector("#isolated-actions");

isolatedMenuToggle?.addEventListener("click", () => {
  const open = isolatedActions?.classList.toggle("open");
  isolatedMenuToggle.setAttribute("aria-expanded", String(Boolean(open)));
});

isolatedActions?.addEventListener("click", event => {
  if (event.target?.tagName === "BUTTON" && event.target?.id !== "cloud-load-save") {
    isolatedActions.classList.remove("open");
    isolatedMenuToggle?.setAttribute("aria-expanded", "false");
  }
});
