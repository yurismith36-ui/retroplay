
const gameId = new URLSearchParams(location.search).get("id");
const statusBox = document.querySelector("#player-status");

function showError(message) {
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

    window.EJS_player = "#game";
    window.EJS_core = game.core;
    window.EJS_gameUrl = game.rom;
    window.EJS_pathtodata = "https://cdn.emulatorjs.org/stable/data/";
    window.EJS_startOnLoaded = false;
    window.EJS_gameName = game.nome;
    window.EJS_gameID = numericGameId(game.id);

    if (game.bios) {
      window.EJS_biosUrl = game.bios;
    }

    const loader = document.createElement("script");
    loader.src = "https://cdn.emulatorjs.org/stable/data/loader.js";
    loader.onload = () => statusBox.classList.add("hidden");
    loader.onerror = () => showError("Não foi possível carregar o EmulatorJS. Verifique sua internet.");
    document.body.appendChild(loader);
  } catch (error) {
    console.error(error);
    showError("O catálogo não carregou. Verifique o arquivo dados/games.json.");
  }
}

document.querySelector("#fullscreen-button").addEventListener("click", async () => {
  const stage = document.querySelector("#emulator-stage");
  try {
    if (!document.fullscreenElement) await stage.requestFullscreen();
    else await document.exitFullscreen();
  } catch (error) {
    console.error(error);
  }
});

startPlayer();
