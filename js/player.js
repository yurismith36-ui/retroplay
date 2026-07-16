const params = new URLSearchParams(location.search);
const gameId = params.get("id");

const els = {
  title: document.getElementById("gameTitle"),
  sidebarTitle: document.getElementById("sidebarTitle"),
  console: document.getElementById("gameConsole"),
  description: document.getElementById("gameDescription"),
  meta: document.getElementById("gameMeta"),
  loadingBox: document.getElementById("loadingBox"),
  loadingText: document.getElementById("loadingText"),
  game: document.getElementById("game"),
  errorBox: document.getElementById("errorBox"),
  errorText: document.getElementById("errorText"),
  fullscreenButton: document.getElementById("fullscreenButton"),
  playerShell: document.getElementById("playerShell")
};

const isIOS =
  /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function realFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function pseudoFullscreenActive() {
  return document.body.classList.contains("retro-pseudo-fullscreen");
}

function updateFullscreenButton() {
  const active = Boolean(realFullscreenElement()) || pseudoFullscreenActive();

  els.fullscreenButton.textContent = active
    ? "✕ Sair da tela cheia"
    : "⛶ Tela cheia";

  els.fullscreenButton.setAttribute("aria-pressed", String(active));
}

function refreshEmulatorSize() {
  window.setTimeout(() => {
    window.dispatchEvent(new Event("resize"));
  }, 120);

  window.setTimeout(() => {
    window.dispatchEvent(new Event("resize"));
  }, 420);
}

function enterPseudoFullscreen() {
  document.body.classList.add("retro-pseudo-fullscreen");
  window.scrollTo(0, 0);
  updateFullscreenButton();
  refreshEmulatorSize();
}

function exitPseudoFullscreen() {
  document.body.classList.remove("retro-pseudo-fullscreen");
  updateFullscreenButton();
  refreshEmulatorSize();
}

async function enterRealFullscreen() {
  if (typeof els.playerShell.requestFullscreen === "function") {
    await els.playerShell.requestFullscreen();
    return true;
  }

  if (typeof els.playerShell.webkitRequestFullscreen === "function") {
    await Promise.resolve(els.playerShell.webkitRequestFullscreen());
    return true;
  }

  return false;
}

async function exitRealFullscreen() {
  if (typeof document.exitFullscreen === "function") {
    await document.exitFullscreen();
    return;
  }

  if (typeof document.webkitExitFullscreen === "function") {
    await Promise.resolve(document.webkitExitFullscreen());
  }
}

async function toggleFullscreen() {
  try {
    if (pseudoFullscreenActive()) {
      exitPseudoFullscreen();
      return;
    }

    if (realFullscreenElement()) {
      await exitRealFullscreen();
      return;
    }

    /*
      Tenta primeiro a tela cheia normal.
      Em versões do Safari que não permitem fullscreen em uma DIV,
      usa automaticamente o modo alternativo.
    */
    const entered = await enterRealFullscreen();

    if (!entered) {
      enterPseudoFullscreen();
    }
  } catch (error) {
    console.warn("Fullscreen normal indisponível; usando modo alternativo.", error);
    enterPseudoFullscreen();
  }
}

function hideLoading() {
  els.loadingBox.hidden = true;
}

function showError(message) {
  hideLoading();
  els.errorText.textContent = message;
  els.errorBox.hidden = false;
}

async function loadGame() {
  if (!gameId) {
    showError("O endereço não informou qual jogo deve ser aberto.");
    return;
  }

  try {
    const response = await fetch("data/games.json", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const games = await response.json();
    const game = games.find(item => item.id === gameId);

    if (!game) {
      showError("O jogo solicitado não foi encontrado no catálogo.");
      return;
    }

    document.title = `${game.nome} — RetroPlay`;
    els.title.textContent = game.nome;
    els.sidebarTitle.textContent = game.nome;
    els.console.textContent = game.console;
    els.description.textContent = game.descricao;
    els.meta.innerHTML = `
      <span>${game.ano || "Ano não informado"}</span>
      <span>${game.genero || "Gênero não informado"}</span>
      <span>${game.desenvolvedora || "Desenvolvedora não informada"}</span>
    `;

    if (!game.rom) {
      showError("O campo 'rom' não foi preenchido em data/games.json.");
      return;
    }

    els.loadingText.textContent =
      "Baixando o núcleo do emulador e preparando a ROM.";

    window.EJS_player = "#game";
    window.EJS_core = game.core || "snes";
    window.EJS_gameUrl = game.rom;
    window.EJS_gameName = game.nome;
    window.EJS_color = "#66c0f4";
    window.EJS_backgroundColor = "#000";
    window.EJS_alignStartButton = "center";
    window.EJS_language = "pt-BR";
    window.EJS_startOnLoaded = false;
    window.EJS_pathtodata = "https://cdn.emulatorjs.org/stable/data/";

    window.EJS_ready = function () {
      hideLoading();
      refreshEmulatorSize();
    };

    window.EJS_onGameStart = function () {
      hideLoading();
      refreshEmulatorSize();
    };

    const loader = document.createElement("script");
    loader.src = "https://cdn.emulatorjs.org/stable/data/loader.js";
    loader.async = true;

    loader.onerror = function () {
      showError("Não foi possível carregar o EmulatorJS pela internet.");
    };

    document.body.appendChild(loader);
  } catch (error) {
    console.error(error);
    showError("Falha ao carregar as informações do jogo.");
  }
}

els.fullscreenButton.addEventListener("click", toggleFullscreen);

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

/*
  No iPhone, impede que a tecla Voltar deixe o usuário preso
  no modo alternativo.
*/
window.addEventListener("pagehide", () => {
  if (pseudoFullscreenActive()) {
    document.body.classList.remove("retro-pseudo-fullscreen");
  }
});

updateFullscreenButton();
loadGame();
