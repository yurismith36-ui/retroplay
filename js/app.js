
const SYSTEMS = [
  { name: "Todos", label: "TODOS" },
  { name: "SNES", label: "SNES" },
  { name: "Game Boy", label: "GB" },
  { name: "Game Boy Color", label: "GBC" },
  { name: "Game Boy Advance", label: "GBA" },
  { name: "Nintendo 64", label: "N64" },
  { name: "Arcade", label: "ARCADE" },
  { name: "Neo Geo", label: "NEO GEO" }
];

const state = {
  games: [],
  console: "Todos",
  query: "",
  sort: "recentes",
  favoritesOnly: false,
  favorites: new Set(JSON.parse(localStorage.getItem("retroplay-favorites") || "[]"))
};

const elements = {
  grid: document.querySelector("#games-grid"),
  vault: document.querySelector("#vault-list"),
  consoleButtons: document.querySelector("#console-buttons"),
  consoleTotal: document.querySelector("#console-total"),
  count: document.querySelector("#games-count"),
  search: document.querySelector("#search-input"),
  sort: document.querySelector("#sort-select"),
  empty: document.querySelector("#empty-state"),
  featuredName: document.querySelector("#featured-name"),
  featuredTitle: document.querySelector("#featured-title"),
  featuredBanner: document.querySelector("#featured-banner"),
  featuredDetails: document.querySelector("#featured-details"),
  featuredPlay: document.querySelector("#featured-play"),
  favoritesTop: document.querySelector("#favorites-top")
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function placeholderCover(title) {
  const safeTitle = escapeHtml(title).slice(0, 22);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <rect width="100%" height="100%" fill="#c7c4cc"/>
    <rect x="24" y="24" width="752" height="552" fill="#e9e7ec" stroke="#3d3544" stroke-width="12"/>
    <rect x="55" y="55" width="690" height="70" fill="#4d2d68"/>
    <text x="400" y="103" text-anchor="middle" fill="#fff" font-family="monospace" font-size="34" font-weight="bold">RETROPLAY</text>
    <text x="400" y="300" text-anchor="middle" fill="#4d2d68" font-family="monospace" font-size="36" font-weight="bold">${safeTitle}</text>
    <text x="400" y="370" text-anchor="middle" fill="#68636f" font-family="sans-serif" font-size="22">SEM IMAGEM</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

async function loadCatalog() {
  try {
    const response = await fetch("./dados/games.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("games.json não contém uma lista.");
    state.games = data;
    renderAll();
  } catch (error) {
    console.error(error);
    elements.grid.innerHTML = `
      <div class="notice">
        <strong>O catálogo não carregou.</strong><br>
        Verifique se <code>dados/games.json</code> existe e se não há vírgula ou chave fora do lugar.
      </div>`;
    elements.count.textContent = "ERRO NO CATÁLOGO";
  }
}

function renderAll() {
  renderConsoleButtons();
  renderVault();
  renderFeatured();
  renderGames();
}

function renderConsoleButtons() {
  elements.consoleTotal.textContent = `${SYSTEMS.length - 1} SISTEMAS`;

  elements.consoleButtons.innerHTML = SYSTEMS.map(system => {
    const amount = system.name === "Todos"
      ? state.games.length
      : state.games.filter(game => game.console === system.name).length;

    return `
      <button class="console-filter ${state.console === system.name ? "active" : ""}"
              type="button"
              data-console="${escapeHtml(system.name)}">
        <span>${escapeHtml(system.label)}</span>
        <small>${amount} ${amount === 1 ? "jogo" : "jogos"}</small>
      </button>`;
  }).join("");

  elements.consoleButtons.querySelectorAll("[data-console]").forEach(button => {
    button.addEventListener("click", () => {
      state.console = button.dataset.console;
      state.favoritesOnly = false;
      elements.favoritesTop.classList.remove("active");
      renderAll();
      document.querySelector("#biblioteca").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderVault() {
  const list = [...state.games]
    .sort((a, b) => Number(b.ordem || 0) - Number(a.ordem || 0))
    .slice(0, 4);

  elements.vault.innerHTML = list.map(game => `
    <a class="vault-item" href="player.html?id=${encodeURIComponent(game.id)}">
      <img src="${escapeHtml(game.capa || "")}" alt=""
           onerror="this.onerror=null;this.src='${placeholderCover(game.nome)}'">
      <strong>${escapeHtml(game.nome)}</strong>
      <span class="vault-arrow">▶</span>
    </a>
  `).join("");
}

function renderFeatured() {
  const game = state.games.find(item => item.destaque) || state.games[0];
  if (!game) return;

  elements.featuredName.textContent = game.nome;
  elements.featuredTitle.textContent = game.nome;
  elements.featuredBanner.src = game.banner || "";
  elements.featuredBanner.onerror = () => {
    elements.featuredBanner.style.display = "none";
  };
  elements.featuredDetails.innerHTML = `
    <li>${escapeHtml(game.console)} • ${escapeHtml(game.ano || "Ano não informado")}</li>
    <li>Gênero: ${escapeHtml(game.genero || "Não informado")}</li>
    <li>Desenvolvedora: ${escapeHtml(game.desenvolvedora || "Não informada")}</li>
    <li>${escapeHtml(game.descricao || "Jogo clássico disponível no RetroPlay.")}</li>
  `;
  elements.featuredPlay.href = `player.html?id=${encodeURIComponent(game.id)}`;
  elements.featuredPlay.classList.remove("disabled");
}

function filteredGames() {
  const term = state.query.trim().toLocaleLowerCase("pt-BR");

  let result = state.games.filter(game => {
    const byConsole = state.console === "Todos" || game.console === state.console;
    const searchable = `${game.nome} ${game.console} ${game.genero || ""} ${game.descricao || ""}`
      .toLocaleLowerCase("pt-BR");
    const bySearch = !term || searchable.includes(term);
    const byFavorite = !state.favoritesOnly || state.favorites.has(game.id);
    return byConsole && bySearch && byFavorite;
  });

  if (state.sort === "nome") {
    result.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  } else if (state.sort === "ano") {
    result.sort((a, b) => Number(b.ano || 0) - Number(a.ano || 0));
  } else {
    result.sort((a, b) => Number(b.ordem || 0) - Number(a.ordem || 0));
  }

  return result;
}

function renderGames() {
  const list = filteredGames();
  elements.count.textContent = `${list.length} ${list.length === 1 ? "JOGO" : "JOGOS"}`;
  elements.empty.classList.toggle("hidden", list.length !== 0);

  elements.grid.innerHTML = list.map(game => `
    <article class="game-card">
      <div class="card-cover">
        <img src="${escapeHtml(game.capa || "")}"
             alt="Capa de ${escapeHtml(game.nome)}"
             loading="lazy"
             onerror="this.onerror=null;this.src='${placeholderCover(game.nome)}'">
        <span class="card-system">${escapeHtml(game.console)}</span>
        <button class="card-favorite ${state.favorites.has(game.id) ? "active" : ""}"
                data-favorite="${escapeHtml(game.id)}"
                type="button"
                aria-label="Favoritar ${escapeHtml(game.nome)}">★</button>
      </div>
      <div class="card-body">
        <h3>${escapeHtml(game.nome)}</h3>
        <div class="card-meta">
          <span>${escapeHtml(game.ano || "Clássico")}</span>
          <span>${escapeHtml(game.genero || "Jogo")}</span>
        </div>
        <a class="card-play" href="player.html?id=${encodeURIComponent(game.id)}">JOGAR ▶</a>
      </div>
    </article>
  `).join("");

  elements.grid.querySelectorAll("[data-favorite]").forEach(button => {
    button.addEventListener("click", () => toggleFavorite(button.dataset.favorite));
  });
}

function toggleFavorite(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);

  localStorage.setItem("retroplay-favorites", JSON.stringify([...state.favorites]));
  renderGames();
}

elements.search.addEventListener("input", () => {
  state.query = elements.search.value;
  renderGames();
});

elements.sort.addEventListener("change", () => {
  state.sort = elements.sort.value;
  renderGames();
});

elements.favoritesTop.addEventListener("click", () => {
  state.favoritesOnly = !state.favoritesOnly;
  state.console = "Todos";
  elements.favoritesTop.classList.toggle("active", state.favoritesOnly);
  renderAll();
  document.querySelector("#biblioteca").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelector("#refresh-site").addEventListener("click", () => location.reload());

loadCatalog();
