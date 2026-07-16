const grid = document.getElementById("gamesGrid");
const searchInput = document.getElementById("searchInput");
const consoleButtons = [...document.querySelectorAll(".console")];
const resultCount = document.getElementById("resultCount");
const emptyState = document.getElementById("emptyState");

let selectedConsole = "Todos";

function normalizeText(value) {
  return value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function renderGames() {
  const query = normalizeText(searchInput.value.trim());

  const filtered = games.filter((game) => {
    const matchesConsole =
      selectedConsole === "Todos" || game.console === selectedConsole;

    const haystack = normalizeText(
      `${game.title} ${game.console} ${game.description}`
    );

    return matchesConsole && haystack.includes(query);
  });

  grid.innerHTML = filtered
    .map(
      (game) => `
        <article class="game-card">
          <div
            class="game-cover"
            style="--card-start:${game.colors[0]};--card-end:${game.colors[1]}"
          >
            <span class="console-badge">${game.console}</span>
            <span class="game-icon" aria-hidden="true">${game.icon}</span>
          </div>

          <div class="game-info">
            <h3>${game.title}</h3>
            <p>${game.description}</p>
            <button class="play-button" type="button" data-title="${game.title}">
              Ver jogo
            </button>
          </div>
        </article>
      `
    )
    .join("");

  resultCount.textContent = `${filtered.length} jogo${filtered.length === 1 ? "" : "s"}`;
  emptyState.hidden = filtered.length !== 0;

  document.querySelectorAll(".play-button").forEach((button) => {
    button.addEventListener("click", () => {
      alert(
        `${button.dataset.title}: na próxima etapa criaremos a página individual e a área do emulador.`
      );
    });
  });
}

consoleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedConsole = button.dataset.console;

    consoleButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");

    renderGames();
  });
});

searchInput.addEventListener("input", renderGames);

renderGames();
