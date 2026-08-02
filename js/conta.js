// RetroPlay Account 2.0 — painel do jogador.
(() => {
  "use strict";

  const client = window.retroplaySupabase;
  const state = {
    user: null,
    games: [],
    favorites: [],
    saves: [],
    activity: [],
    matches: [],
    schemaReady: true,
    trophies: []
  };

  const el = {
    loading: document.querySelector("#account-loading"),
    error: document.querySelector("#account-error"),
    setupWarning: document.querySelector("#account-setup-warning"),
    content: document.querySelector("#account-content"),
    avatar: document.querySelector("#profile-avatar"),
    name: document.querySelector("#profile-name"),
    email: document.querySelector("#profile-email"),
    logout: document.querySelector("#logout-button"),
    level: document.querySelector("#profile-level"),
    xp: document.querySelector("#profile-xp"),
    nextLevel: document.querySelector("#profile-next-level"),
    xpBar: document.querySelector("#profile-xp-bar"),
    favoriteCount: document.querySelector("#favorite-count"),
    saveCount: document.querySelector("#save-count"),
    trophyGrid: document.querySelector("#trophy-grid"),
    trophySummary: document.querySelector("#trophy-summary"),
    recentTrophies: document.querySelector("#overview-recent-trophies"),
    recentActivity: document.querySelector("#overview-recent-activity"),
    onlineHistory: document.querySelector("#online-history"),
    startedGames: document.querySelector("#started-games-list"),
    completedGames: document.querySelector("#completed-games-list"),
    onlineForm: document.querySelector("#online-result-form"),
    onlineGame: document.querySelector("#online-game"),
    onlineOpponent: document.querySelector("#online-opponent"),
    onlineResult: document.querySelector("#online-result"),
    onlineMessage: document.querySelector("#online-form-message"),
    completeForm: document.querySelector("#complete-game-form"),
    completeGame: document.querySelector("#complete-game"),
    completeMessage: document.querySelector("#complete-form-message")
  };

  const trophyCatalog = [
    { key: "welcome", icon: "👤", title: "Bem-vindo ao RetroPlay", description: "Entre na sua conta pela primeira vez.", rarity: "COMUM", unlocked: () => true },
    { key: "favorite", icon: "❤️", title: "Primeiro favorito", description: "Adicione um jogo aos favoritos.", rarity: "COMUM", unlocked: s => s.favoriteCount >= 1 },
    { key: "save", icon: "☁️", title: "Memória preservada", description: "Crie seu primeiro save na nuvem.", rarity: "COMUM", unlocked: s => s.saveCount >= 1 },
    { key: "starter", icon: "🎮", title: "Aperte Start", description: "Inicie seu primeiro jogo com a conta conectada.", rarity: "COMUM", unlocked: s => s.startedCount >= 1 },
    { key: "finisher", icon: "✅", title: "Até o fim", description: "Finalize seu primeiro jogo.", rarity: "RARO", unlocked: s => s.completedCount >= 1 },
    { key: "arena", icon: "⚔️", title: "Entrou na Arena", description: "Registre sua primeira partida online.", rarity: "COMUM", unlocked: s => s.onlineTotal >= 1 },
    { key: "winner", icon: "🏆", title: "Primeira vitória", description: "Vença sua primeira partida online.", rarity: "RARO", unlocked: s => s.wins >= 1 },
    { key: "streak", icon: "🔥", title: "Lutador da Arena", description: "Alcance 10 vitórias online.", rarity: "ÉPICO", unlocked: s => s.wins >= 10 },
    { key: "collector", icon: "🕹️", title: "Colecionador retrô", description: "Inicie 10 jogos diferentes.", rarity: "RARO", unlocked: s => s.startedCount >= 10 },
    { key: "master", icon: "👑", title: "Mestre do catálogo", description: "Finalize 10 jogos.", rarity: "LENDÁRIO", unlocked: s => s.completedCount >= 10 },
    { key: "veteran", icon: "🥊", title: "Veterano online", description: "Complete 25 partidas online.", rarity: "ÉPICO", unlocked: s => s.onlineTotal >= 25 },
    { key: "library", icon: "💜", title: "Biblioteca favorita", description: "Tenha 10 jogos nos favoritos.", rarity: "RARO", unlocked: s => s.favoriteCount >= 10 }
  ];

  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function displayName(user) {
    return window.RetroPlayAuth?.displayName?.(user)
      || user?.user_metadata?.display_name
      || user?.email?.split("@")[0]
      || "Jogador";
  }

  function initials(name) {
    const parts = String(name || "RP").trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || "RP").toUpperCase();
  }

  function formatDate(value, withTime = false) {
    if (!value) return "—";
    try {
      return new Intl.DateTimeFormat("pt-BR", withTime
        ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }
        : { day: "2-digit", month: "2-digit", year: "numeric" }
      ).format(new Date(value));
    } catch (_error) {
      return "—";
    }
  }

  function setText(id, value) {
    const node = document.querySelector(`#${id}`);
    if (node) node.textContent = String(value);
  }

  function setFormMessage(node, message = "", type = "") {
    node.textContent = message;
    node.className = `account-form-message${type ? ` ${type}` : ""}`;
  }

  function isSchemaMissing(error) {
    return window.RetroPlayStats?.isSchemaMissing?.(error)
      || /player_game_activity|player_online_matches|retroplay_record_game_start|retroplay_set_game_completed|does not exist|schema cache/i.test(String(error?.message || error || ""));
  }

  async function getSessionUser() {
    if (!client) throw new Error("O Supabase não foi carregado.");
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data?.session?.user || null;
  }

  async function loadCatalog() {
    const response = await fetch("./dados/games.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível carregar o catálogo.");
    const data = await response.json();
    state.games = Array.isArray(data) ? data : [];

    const options = [`<option value="">Escolha um jogo</option>`, ...state.games.map(game =>
      `<option value="${escapeHtml(game.id)}">${escapeHtml(game.nome)} — ${escapeHtml(game.console || "Console")}</option>`
    )].join("");
    el.onlineGame.innerHTML = options;
    el.completeGame.innerHTML = options;
  }

  async function safeQuery(promise, fallback = []) {
    try {
      const result = await promise;
      if (result?.error) throw result.error;
      return result?.data ?? fallback;
    } catch (error) {
      if (isSchemaMissing(error)) {
        state.schemaReady = false;
        return fallback;
      }
      throw error;
    }
  }

  async function loadData() {
    const userId = state.user.id;
    const [favorites, saves, activity, matches] = await Promise.all([
      safeQuery(client.from("favorites").select("game_id").eq("user_id", userId)),
      safeQuery(client.from("game_saves").select("game_id,updated_at").eq("user_id", userId)),
      safeQuery(client.from("player_game_activity")
        .select("game_id,game_name,game_console,game_cover,started_count,first_played_at,last_played_at,completed_at")
        .eq("user_id", userId)
        .order("last_played_at", { ascending: false })),
      safeQuery(client.from("player_online_matches")
        .select("id,game_id,game_name,game_console,game_cover,opponent_name,result,room_code,played_at")
        .eq("user_id", userId)
        .order("played_at", { ascending: false })
        .limit(100))
    ]);

    state.favorites = favorites || [];
    state.saves = saves || [];
    state.activity = activity || [];
    state.matches = matches || [];
  }

  function statsSnapshot() {
    const wins = state.matches.filter(match => match.result === "win").length;
    const losses = state.matches.filter(match => match.result === "loss").length;
    const draws = state.matches.filter(match => match.result === "draw").length;
    const startedCount = state.activity.filter(game => Number(game.started_count) > 0).length;
    const completedCount = state.activity.filter(game => game.completed_at).length;
    const snapshot = {
      favoriteCount: state.favorites.length,
      saveCount: state.saves.length,
      startedCount,
      completedCount,
      wins,
      losses,
      draws,
      onlineTotal: state.matches.length
    };
    snapshot.trophies = trophyCatalog.map(trophy => ({ ...trophy, isUnlocked: Boolean(trophy.unlocked(snapshot)) }));
    snapshot.unlockedCount = snapshot.trophies.filter(trophy => trophy.isUnlocked).length;
    snapshot.xp = snapshot.favoriteCount * 10
      + snapshot.saveCount * 15
      + snapshot.startedCount * 20
      + snapshot.completedCount * 100
      + snapshot.onlineTotal * 30
      + snapshot.wins * 50;
    snapshot.level = Math.floor(snapshot.xp / 500) + 1;
    snapshot.levelProgress = snapshot.xp % 500;
    snapshot.winRate = snapshot.onlineTotal ? Math.round((snapshot.wins / snapshot.onlineTotal) * 100) : 0;
    return snapshot;
  }

  function renderProfile(snapshot) {
    const name = displayName(state.user);
    el.name.textContent = name;
    el.email.textContent = state.user.email || "";
    el.avatar.textContent = initials(name);
    el.level.textContent = snapshot.level;
    el.xp.textContent = `${snapshot.xp} XP`;
    const remaining = 500 - snapshot.levelProgress;
    el.nextLevel.textContent = `${remaining} XP para o nível ${snapshot.level + 1}`;
    el.xpBar.style.width = `${Math.max(0, Math.min(100, (snapshot.levelProgress / 500) * 100))}%`;
  }

  function renderCounts(snapshot) {
    el.favoriteCount.textContent = snapshot.favoriteCount;
    el.saveCount.textContent = snapshot.saveCount;
    setText("overview-trophies", `${snapshot.unlockedCount}/${trophyCatalog.length}`);
    setText("overview-wins", snapshot.wins);
    setText("overview-started", snapshot.startedCount);
    setText("overview-completed", snapshot.completedCount);
    setText("overview-online-total", snapshot.onlineTotal);
    setText("overview-draws", snapshot.draws);
    setText("online-wins", snapshot.wins);
    setText("online-losses", snapshot.losses);
    setText("online-draws", snapshot.draws);
    setText("online-rate", `${snapshot.winRate}%`);
    setText("games-started", snapshot.startedCount);
    setText("games-completed", snapshot.completedCount);
    setText("games-saves", snapshot.saveCount);
    setText("games-favorites", snapshot.favoriteCount);
  }

  function renderTrophies(snapshot) {
    state.trophies = snapshot.trophies;
    el.trophySummary.textContent = `${snapshot.unlockedCount} de ${trophyCatalog.length} desbloqueados`;
    el.trophyGrid.innerHTML = snapshot.trophies.map(trophy => `
      <article class="account-trophy ${trophy.isUnlocked ? "unlocked" : "locked"}">
        <div class="account-trophy-icon">${trophy.isUnlocked ? trophy.icon : "🔒"}</div>
        <h3>${escapeHtml(trophy.title)}</h3>
        <p>${escapeHtml(trophy.description)}</p>
        <footer><span>${escapeHtml(trophy.rarity)}</span><span>${trophy.isUnlocked ? "DESBLOQUEADO" : "BLOQUEADO"}</span></footer>
      </article>
    `).join("");

    const recent = snapshot.trophies.filter(trophy => trophy.isUnlocked).slice(-3).reverse();
    el.recentTrophies.innerHTML = recent.length ? recent.map(trophy => `
      <div class="account-compact-item">
        <span class="account-item-icon">${trophy.icon}</span>
        <div class="account-item-copy"><strong>${escapeHtml(trophy.title)}</strong><span>${escapeHtml(trophy.description)}</span></div>
        <span class="account-item-meta">${escapeHtml(trophy.rarity)}</span>
      </div>
    `).join("") : `<div class="account-empty">Jogue para desbloquear seus primeiros troféus.</div>`;
  }

  function renderOnline() {
    el.onlineHistory.innerHTML = state.matches.length ? state.matches.slice(0, 15).map(match => {
      const label = match.result === "win" ? "VITÓRIA" : match.result === "loss" ? "DERROTA" : "EMPATE";
      const icon = match.result === "win" ? "🏆" : match.result === "loss" ? "💥" : "🤝";
      return `
        <div class="account-match-item">
          <span class="account-item-icon">${icon}</span>
          <div class="account-item-copy">
            <strong>${escapeHtml(match.game_name)}</strong>
            <span>Contra ${escapeHtml(match.opponent_name || "Rival")}</span>
          </div>
          <div class="account-item-meta">
            <span class="account-match-result ${match.result}">${label}</span><br>
            ${formatDate(match.played_at)}
          </div>
        </div>
      `;
    }).join("") : `<div class="account-empty">Nenhuma partida online registrada.</div>`;
  }

  function gameFallback(activity) {
    return state.games.find(game => game.id === activity.game_id) || {
      id: activity.game_id,
      nome: activity.game_name,
      console: activity.game_console,
      capa: activity.game_cover
    };
  }

  function renderGames() {
    const started = state.activity.filter(game => Number(game.started_count) > 0);
    const completed = state.activity.filter(game => game.completed_at);

    el.startedGames.innerHTML = started.length ? started.slice(0, 8).map(activity => {
      const game = gameFallback(activity);
      return `
        <div class="account-game-item">
          <img src="${escapeHtml(game.capa || "assets/icone-controle.svg")}" alt="" loading="lazy">
          <div class="account-item-copy">
            <strong>${escapeHtml(game.nome || activity.game_name)}</strong>
            <span>${escapeHtml(game.console || activity.game_console || "Console")} · iniciado ${Number(activity.started_count) || 1} vez(es)</span>
          </div>
          <span class="account-item-meta">${formatDate(activity.last_played_at)}</span>
        </div>
      `;
    }).join("") : `<div class="account-empty">Abra um jogo conectado à sua conta para ele aparecer aqui.</div>`;

    el.completedGames.innerHTML = completed.length ? completed.map(activity => {
      const game = gameFallback(activity);
      return `
        <div class="account-game-item">
          <img src="${escapeHtml(game.capa || "assets/icone-controle.svg")}" alt="" loading="lazy">
          <div class="account-item-copy">
            <strong>${escapeHtml(game.nome || activity.game_name)}</strong>
            <span>${escapeHtml(game.console || activity.game_console || "Console")} · finalizado em ${formatDate(activity.completed_at)}</span>
          </div>
          <button type="button" data-uncomplete-game="${escapeHtml(activity.game_id)}">DESMARCAR</button>
        </div>
      `;
    }).join("") : `<div class="account-empty">Nenhum jogo foi marcado como finalizado.</div>`;
  }

  function renderRecentActivity() {
    const entries = [
      ...state.matches.slice(0, 5).map(match => ({
        date: match.played_at,
        icon: match.result === "win" ? "🏆" : match.result === "loss" ? "💥" : "🤝",
        title: `${match.result === "win" ? "Vitória" : match.result === "loss" ? "Derrota" : "Empate"} em ${match.game_name}`,
        subtitle: `Contra ${match.opponent_name || "Rival"}`
      })),
      ...state.activity.filter(game => game.completed_at).slice(0, 5).map(game => ({
        date: game.completed_at,
        icon: "✅",
        title: `${game.game_name} finalizado`,
        subtitle: game.game_console || "Console"
      })),
      ...state.activity.slice(0, 5).map(game => ({
        date: game.last_played_at,
        icon: "🎮",
        title: `Jogou ${game.game_name}`,
        subtitle: game.game_console || "Console"
      }))
    ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 8);

    el.recentActivity.innerHTML = entries.length ? entries.map(entry => `
      <div class="account-activity-item">
        <span class="account-item-icon">${entry.icon}</span>
        <div class="account-item-copy"><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(entry.subtitle)}</span></div>
        <span class="account-item-meta">${formatDate(entry.date, true)}</span>
      </div>
    `).join("") : `<div class="account-empty">Sua atividade aparecerá aqui conforme você jogar.</div>`;
  }

  function renderSetupWarning() {
    if (state.schemaReady) {
      el.setupWarning.classList.add("hidden");
      el.onlineForm.querySelectorAll("input,select,button").forEach(node => { node.disabled = false; });
      el.completeForm.querySelectorAll("select,button").forEach(node => { node.disabled = false; });
      return;
    }

    el.setupWarning.textContent = "A página foi corrigida e já abre normalmente. Para ativar jogos iniciados, finalizados, troféus e partidas online, execute o arquivo RETROPLAY-CONTA-2.0.sql no Supabase.";
    el.setupWarning.classList.remove("hidden");
    el.onlineForm.querySelectorAll("input,select,button").forEach(node => { node.disabled = true; });
    el.completeForm.querySelectorAll("select,button").forEach(node => { node.disabled = true; });
  }

  function render() {
    const snapshot = statsSnapshot();
    renderProfile(snapshot);
    renderCounts(snapshot);
    renderTrophies(snapshot);
    renderOnline();
    renderGames();
    renderRecentActivity();
    renderSetupWarning();
  }

  function showTab(tabName) {
    document.querySelectorAll("[data-account-tab]").forEach(button => {
      const active = button.dataset.accountTab === tabName;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".account-tab-panel").forEach(panel => {
      const active = panel.id === `tab-${tabName}`;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
  }

  async function refresh() {
    await loadData();
    render();
  }

  async function submitOnlineResult(event) {
    event.preventDefault();
    const game = state.games.find(item => item.id === el.onlineGame.value);
    const opponentName = el.onlineOpponent.value.trim();
    const result = el.onlineResult.value;
    if (!game || !opponentName) return setFormMessage(el.onlineMessage, "Escolha o jogo e informe o rival.", "error");

    const button = el.onlineForm.querySelector("button[type=submit]");
    button.disabled = true;
    setFormMessage(el.onlineMessage, "Salvando...");
    try {
      await window.RetroPlayStats.recordOnlineResult({ game, opponentName, result });
      el.onlineOpponent.value = "";
      setFormMessage(el.onlineMessage, "Resultado salvo!", "success");
      await refresh();
    } catch (error) {
      state.schemaReady = !isSchemaMissing(error);
      setFormMessage(el.onlineMessage, isSchemaMissing(error) ? "Execute o SQL da Conta 2.0 no Supabase." : error.message, "error");
      renderSetupWarning();
    } finally {
      button.disabled = false;
    }
  }

  async function submitCompletedGame(event) {
    event.preventDefault();
    const game = state.games.find(item => item.id === el.completeGame.value);
    if (!game) return setFormMessage(el.completeMessage, "Escolha um jogo.", "error");

    const button = el.completeForm.querySelector("button[type=submit]");
    button.disabled = true;
    setFormMessage(el.completeMessage, "Salvando...");
    try {
      await window.RetroPlayStats.setGameCompleted(game, true);
      setFormMessage(el.completeMessage, `${game.nome} marcado como finalizado!`, "success");
      await refresh();
    } catch (error) {
      state.schemaReady = !isSchemaMissing(error);
      setFormMessage(el.completeMessage, isSchemaMissing(error) ? "Execute o SQL da Conta 2.0 no Supabase." : error.message, "error");
      renderSetupWarning();
    } finally {
      button.disabled = false;
    }
  }

  async function uncompleteGame(gameId) {
    const game = state.games.find(item => item.id === gameId) || gameFallback(state.activity.find(item => item.game_id === gameId));
    if (!game || !confirm(`Remover ${game.nome} da lista de finalizados?`)) return;
    await window.RetroPlayStats.setGameCompleted(game, false);
    await refresh();
  }

  function bind() {
    document.querySelectorAll("[data-account-tab]").forEach(button => button.addEventListener("click", () => showTab(button.dataset.accountTab)));
    document.querySelectorAll("[data-open-tab]").forEach(button => button.addEventListener("click", () => showTab(button.dataset.openTab)));
    el.onlineForm.addEventListener("submit", submitOnlineResult);
    el.completeForm.addEventListener("submit", submitCompletedGame);
    el.completedGames.addEventListener("click", event => {
      const button = event.target.closest("[data-uncomplete-game]");
      if (button) uncompleteGame(button.dataset.uncompleteGame).catch(showFatalError);
    });
    el.logout.addEventListener("click", async () => {
      el.logout.disabled = true;
      try { await window.RetroPlayAuth.signOut(); }
      catch (error) { showFatalError(error); el.logout.disabled = false; }
    });
  }

  function showFatalError(error) {
    console.error("Conta RetroPlay:", error);
    el.loading.classList.add("hidden");
    el.error.textContent = `Não foi possível carregar sua conta: ${error?.message || error}`;
    el.error.classList.remove("hidden");
  }

  async function initialize() {
    bind();
    state.user = await getSessionUser();
    if (!state.user) {
      const returnUrl = encodeURIComponent("conta.html");
      location.replace(`login.html?return=${returnUrl}`);
      return;
    }

    await loadCatalog();
    await loadData();
    render();
    el.loading.classList.add("hidden");
    el.content.classList.remove("hidden");
  }

  initialize().catch(showFatalError);
})();
