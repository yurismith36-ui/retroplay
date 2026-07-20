const state = {
  games: [],
  console: "Todos",
  query: "",
  featured: null,
  favorites: new Set(JSON.parse(localStorage.getItem("retroplay-favorites") || "[]"))
};

const $ = id => document.getElementById(id);

function saveFavorites() {
  localStorage.setItem("retroplay-favorites", JSON.stringify([...state.favorites]));
}

function toggleFavorite(id) {
  state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
  saveFavorites();
  renderCatalog();
  renderFavorites();
  renderHero();
}

function card(game) {
  const favorite = state.favorites.has(game.id);
  return `
    <article class="game-card" data-game="${game.id}" tabindex="0">
      <div class="cover">
        <img src="${game.capa}" alt="Capa de ${game.nome}" loading="lazy"
             onerror="this.style.display='none'">
        <div class="cover-overlay">
          <a class="round-play" href="player.html?id=${encodeURIComponent(game.id)}">▶</a>
          <button class="heart ${favorite ? "active" : ""}" data-favorite="${game.id}" type="button">
            ${favorite ? "♥" : "♡"}
          </button>
        </div>
      </div>
      <div class="card-content">
        <h3>${game.nome}</h3>
        <div class="card-meta"><span>${game.console}</span><span>${game.ano || ""}</span></div>
        <p>${game.descricao || ""}</p>
        <div class="card-actions">
          <a class="play" href="player.html?id=${encodeURIComponent(game.id)}">▶ Jogar</a>
          <button class="favorite-text" data-favorite="${game.id}" type="button">
            ${favorite ? "♥" : "♡"}
          </button>
        </div>
      </div>
    </article>`;
}

function bindCards(container) {
  if (!container) return;

  container.querySelectorAll("[data-favorite]").forEach(button => {
    button.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(button.dataset.favorite);
    };
  });

  container.querySelectorAll("[data-game]").forEach(element => {
    const setFeatured = () => {
      state.featured = element.dataset.game;
      renderHero();
    };
    element.onmouseenter = setFeatured;
    element.onfocusin = setFeatured;
  });
}

function filtered() {
  const q = state.query.toLocaleLowerCase("pt-BR");
  return state.games.filter(game => {
    const consoleOk = state.console === "Todos" || game.console === state.console;
    const text = `${game.nome} ${game.console} ${game.genero || ""} ${game.descricao || ""}`
      .toLocaleLowerCase("pt-BR");
    return consoleOk && text.includes(q);
  });
}

function renderCatalog() {
  const grid = $("gamesGrid");
  if (!grid) return;

  const list = filtered();
  grid.innerHTML = list.map(card).join("");
  bindCards(grid);

  if ($("resultCount")) {
    $("resultCount").textContent = `${list.length} jogo${list.length === 1 ? "" : "s"}`;
  }
  if ($("emptyState")) {
    $("emptyState").hidden = list.length > 0;
  }
}

function renderFavorites() {
  const grid = $("favoritesGrid");
  if (!grid) return;

  const list = state.games.filter(game => state.favorites.has(game.id));
  grid.innerHTML = list.map(card).join("");
  bindCards(grid);

  if ($("favoritesEmpty")) {
    $("favoritesEmpty").hidden = list.length > 0;
  }
}

function renderConsoles() {
  const list = $("consoleList");
  if (!list) return;

  const consoles = ["Todos", ...new Set(state.games.map(game => game.console))];
  list.innerHTML = consoles.map(console => `
    <button type="button"
            class="console ${console === state.console ? "active" : ""}"
            data-console="${console}">
      ${console}
    </button>
  `).join("");

  document.querySelectorAll("[data-console]").forEach(button => {
    button.onclick = () => {
      state.console = button.dataset.console;
      renderConsoles();
      renderCatalog();
    };
  });
}

function featuredGame() {
  return state.games.find(game => game.id === state.featured)
    || state.games.find(game => game.destaque)
    || state.games[0];
}

function renderHero() {
  const game = featuredGame();
  const hero = $("hero");
  if (!game || !hero) return;

  hero.style.backgroundImage = `
    linear-gradient(90deg,rgba(6,10,16,.98),rgba(6,10,16,.74) 43%,rgba(6,10,16,.08) 82%),
    linear-gradient(0deg,#0b1017,transparent 35%),
    url("${game.banner}")
  `;

  if ($("heroConsole")) $("heroConsole").textContent = game.console;
  if ($("heroDescription")) $("heroDescription").textContent = game.descricao || "";
  if ($("heroMeta")) {
    $("heroMeta").innerHTML = `
      <span>${game.ano || "Ano não informado"}</span>
      <span>${game.genero || "Gênero não informado"}</span>
      <span>${game.desenvolvedora || "Desenvolvedora não informada"}</span>
    `;
  }

  if ($("heroTitle")) {
    $("heroTitle").innerHTML = game.logo
      ? `<img class="hero-logo" src="${game.logo}" alt="${game.nome}"
              onerror="this.outerHTML='${game.nome.replace(/'/g, "&#39;")}'">`
      : game.nome;
  }

  if ($("heroPlay")) {
    $("heroPlay").onclick = () => location.href = `player.html?id=${encodeURIComponent(game.id)}`;
  }

  if ($("heroFavorite")) {
    $("heroFavorite").textContent = state.favorites.has(game.id) ? "♥ Favoritado" : "♡ Favoritar";
    $("heroFavorite").onclick = () => toggleFavorite(game.id);
  }
}

function renderAll() {
  renderConsoles();
  renderCatalog();
  renderFavorites();
  renderHero();
}

const searchInput = $("searchInput");
if (searchInput) {
  searchInput.oninput = event => {
    state.query = event.target.value;
    renderCatalog();
  };
}

fetch("dados/games.json", { cache: "no-store" })
  .then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then(games => {
    if (!Array.isArray(games)) throw new Error("games.json precisa conter uma lista de jogos.");
    state.games = games;
    renderAll();
  })
  .catch(error => {
    console.error("Falha ao carregar o catálogo:", error);
    const grid = $("gamesGrid");
    if (grid) {
      grid.innerHTML = '<div class="empty">Erro ao carregar dados/games.json.</div>';
    }
  });
