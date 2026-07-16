const state = {
  games: [],
  console: "Todos",
  query: "",
  favorites: new Set(
    JSON.parse(localStorage.getItem("retroplay-favorites") || "[]")
  ),
  featuredId: null
};

const $ = id => document.getElementById(id);

function saveFavorites() {
  localStorage.setItem(
    "retroplay-favorites",
    JSON.stringify([...state.favorites])
  );
}

function toggleFavorite(id) {
  state.favorites.has(id)
    ? state.favorites.delete(id)
    : state.favorites.add(id);

  saveFavorites();
  renderCatalog();
  renderFavorites();
  renderHero();
}

function imageFallback(icon = "🎮") {
  return `
    <div class="cover-fallback">
      <span>${icon}</span>
    </div>
  `;
}

function coverHtml(game) {
  if (!game.capa) {
    return imageFallback(game.icone || "🎮");
  }

  return `
    <img
      class="cover-image"
      src="${game.capa}"
      alt="Capa de ${game.nome}"
      loading="lazy"
      onerror="this.outerHTML=\`${imageFallback(game.icone || "🎮")}\`"
    >
  `;
}

function card(game) {
  const favorite = state.favorites.has(game.id);

  return `
    <article
      class="game-card"
      data-game="${game.id}"
      tabindex="0"
      aria-label="${game.nome}"
    >
      <div class="cover">
        ${coverHtml(game)}

        <div class="cover-overlay">
          <a
            class="round-play"
            href="player.html?id=${encodeURIComponent(game.id)}"
            aria-label="Jogar ${game.nome}"
          >▶</a>

          <button
            class="favorite-button ${favorite ? "active" : ""}"
            data-favorite="${game.id}"
            type="button"
            aria-label="Favoritar ${game.nome}"
          >${favorite ? "♥" : "♡"}</button>
        </div>
      </div>

      <div class="card-content">
        <h3>${game.nome}</h3>
        <div class="card-meta">
          <span>${game.console}</span>
          <span>${game.ano || ""}</span>
        </div>

        <p>${game.descricao || ""}</p>

        <div class="card-actions">
          <a
            class="play"
            href="player.html?id=${encodeURIComponent(game.id)}"
          >▶ Jogar</a>

          <button
            class="favorite-text ${favorite ? "active" : ""}"
            data-favorite="${game.id}"
            type="button"
          >${favorite ? "♥ Favoritado" : "♡ Favoritar"}</button>
        </div>
      </div>
    </article>
  `;
}

function bindCards(container) {
  container.querySelectorAll("[data-favorite]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(button.dataset.favorite);
    });
  });

  container.querySelectorAll("[data-game]").forEach(cardElement => {
    const show = () => {
      state.featuredId = cardElement.dataset.game;
      renderHero();
    };

    cardElement.addEventListener("mouseenter", show);
    cardElement.addEventListener("focusin", show);
  });
}

function filteredGames() {
  const query = state.query.toLocaleLowerCase("pt-BR");

  return state.games.filter(game => {
    const matchesConsole =
      state.console === "Todos" || game.console === state.console;

    const searchable = `
      ${game.nome}
      ${game.console}
      ${game.genero || ""}
      ${game.descricao || ""}
    `.toLocaleLowerCase("pt-BR");

    return matchesConsole && searchable.includes(query);
  });
}

function renderCatalog() {
  const list = filteredGames();
  $("gamesGrid").innerHTML = list.map(card).join("");
  bindCards($("gamesGrid"));

  $("resultCount").textContent =
    `${list.length} jogo${list.length === 1 ? "" : "s"}`;

  $("emptyState").hidden = list.length > 0;
}

function renderFavorites() {
  const list = state.games.filter(game => state.favorites.has(game.id));

  $("favoritesGrid").innerHTML = list.map(card).join("");
  bindCards($("favoritesGrid"));

  $("favoritesEmpty").hidden = list.length > 0;
}

function renderConsoles() {
  const consoles = ["Todos", ...new Set(state.games.map(game => game.console))];

  $("consoleList").innerHTML = consoles.map(console => `
    <button
      class="console ${console === state.console ? "active" : ""}"
      data-console="${console}"
      type="button"
    >${console}</button>
  `).join("");

  document.querySelectorAll("[data-console]").forEach(button => {
    button.addEventListener("click", () => {
      state.console = button.dataset.console;
      renderConsoles();
      renderCatalog();
    });
  });
}

function featuredGame() {
  return (
    state.games.find(game => game.id === state.featuredId) ||
    state.games.find(game => game.destaque) ||
    state.games[0]
  );
}

function renderHero() {
  const game = featuredGame();
  if (!game) return;

  const hero = $("hero");
  const title = $("heroTitle");
  const favorite = state.favorites.has(game.id);

  if (game.banner) {
    hero.style.backgroundImage = `
      linear-gradient(
        90deg,
        rgba(8, 13, 20, .98) 0%,
        rgba(8, 13, 20, .84) 38%,
        rgba(8, 13, 20, .28) 72%,
        rgba(8, 13, 20, .12) 100%
      ),
      linear-gradient(
        0deg,
        rgba(15, 20, 28, 1) 0%,
        rgba(15, 20, 28, 0) 38%
      ),
      url("${game.banner}")
    `;
    hero.classList.add("has-banner");
  } else {
    hero.style.backgroundImage =
      "linear-gradient(135deg,#174b35,#101e46)";
    hero.classList.remove("has-banner");
  }

  $("heroConsole").textContent = game.console;
  $("heroDescription").textContent = game.descricao || "";

  if (game.logo) {
    title.innerHTML = `
      <img
        class="hero-logo"
        src="${game.logo}"
        alt="${game.nome}"
        onerror="this.outerHTML='<span>${game.nome}</span>'"
      >
    `;
  } else {
    title.textContent = game.nome;
  }

  $("heroMeta").innerHTML = `
    <span>${game.ano || "Ano não informado"}</span>
    <span>${game.genero || "Gênero não informado"}</span>
    <span>${game.desenvolvedora || "Desenvolvedora não informada"}</span>
  `;

  $("heroPlay").onclick = () => {
    location.href = `player.html?id=${encodeURIComponent(game.id)}`;
  };

  $("heroFavorite").textContent =
    favorite ? "♥ Favoritado" : "♡ Favoritar";

  $("heroFavorite").onclick = () => toggleFavorite(game.id);
}

function renderAll() {
  renderConsoles();
  renderCatalog();
  renderFavorites();
  renderHero();
}

$("searchInput").addEventListener("input", event => {
  state.query = event.target.value;
  renderCatalog();
});

fetch("data/games.json", { cache: "no-store" })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  })
  .then(games => {
    state.games = games;
    renderAll();
  })
  .catch(error => {
    console.error(error);
    $("gamesGrid").innerHTML = `
      <div class="empty">
        Não foi possível carregar <strong>data/games.json</strong>.
      </div>
    `;
  });
