// RetroPlay Comunidade 1.0 — comentários por jogo e presença online
(() => {
  "use strict";

  const client = window.retroplaySupabase;
  const PRESENCE_CHANNEL = "retroplay-community-presence";
  const MAX_COMMENTS = 50;

  const state = {
    user: null,
    games: [],
    selectedGameId: new URLSearchParams(location.search).get("jogo") || "",
    comments: [],
    onlineUserIds: new Set(),
    presenceChannel: null,
    commentsChannel: null,
    reloadTimer: null
  };

  const elements = {
    gameFilter: document.querySelector("#community-game-filter"),
    gameSelect: document.querySelector("#community-game-select"),
    form: document.querySelector("#community-form"),
    message: document.querySelector("#community-message"),
    submit: document.querySelector("#community-submit"),
    charCount: document.querySelector("#community-char-count"),
    feedback: document.querySelector("#community-feedback"),
    authNotice: document.querySelector("#community-auth-notice"),
    currentUser: document.querySelector("#community-current-user"),
    comments: document.querySelector("#community-comments"),
    commentTotal: document.querySelector("#community-comment-total"),
    filterLabel: document.querySelector("#community-filter-label"),
    onlineTotal: document.querySelector("#community-online-total"),
    refresh: document.querySelector("#community-refresh")
  };

  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function hashText(value = "") {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0);
  }

  function avatarData(seedValue) {
    const seed = Number(seedValue) || 1;
    const palettes = [
      ["#46285d", "#c9a7df", "#f5eaff"],
      ["#174f68", "#63c1d6", "#e9fbff"],
      ["#6a2a3c", "#e27b91", "#fff0f3"],
      ["#2f5d39", "#83cc79", "#f0ffe9"],
      ["#76531e", "#e6b95b", "#fff7df"],
      ["#33345f", "#8f95e9", "#f0f1ff"]
    ];
    const palette = palettes[seed % palettes.length];
    const eyeGap = 12 + (seed % 4);
    const antenna = seed % 2 === 0
      ? `<rect x="29" y="6" width="6" height="10" fill="${palette[2]}"/><rect x="26" y="3" width="12" height="6" fill="${palette[1]}"/>`
      : `<rect x="11" y="10" width="10" height="6" fill="${palette[1]}"/><rect x="43" y="10" width="10" height="6" fill="${palette[1]}"/>`;
    const mouth = seed % 3 === 0
      ? `<rect x="22" y="44" width="20" height="5" fill="${palette[0]}"/><rect x="27" y="49" width="10" height="4" fill="${palette[0]}"/>`
      : `<rect x="22" y="43" width="5" height="5" fill="${palette[0]}"/><rect x="27" y="48" width="10" height="5" fill="${palette[0]}"/><rect x="37" y="43" width="5" height="5" fill="${palette[0]}"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" shape-rendering="crispEdges">
      <rect width="64" height="64" rx="4" fill="${palette[0]}"/>
      ${antenna}
      <rect x="10" y="16" width="44" height="42" fill="${palette[1]}"/>
      <rect x="15" y="21" width="34" height="31" fill="${palette[2]}"/>
      <rect x="${19 - (eyeGap - 12) / 2}" y="29" width="8" height="9" fill="${palette[0]}"/>
      <rect x="${37 + (eyeGap - 12) / 2}" y="29" width="8" height="9" fill="${palette[0]}"/>
      ${mouth}
      <rect x="6" y="25" width="5" height="17" fill="${palette[1]}"/>
      <rect x="53" y="25" width="5" height="17" fill="${palette[1]}"/>
    </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function reactionLabel(value) {
    if (value === "gostei") return "👍 Gostei";
    if (value === "nao_gostei") return "👎 Não gostei";
    return "💬 Neutro";
  }

  function timeLabel(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "agora";
    const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return "agora";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `há ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `há ${days} dia${days === 1 ? "" : "s"}`;
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function displayName(user) {
    return window.RetroPlayAuth?.displayName?.(user)
      || user?.user_metadata?.display_name
      || user?.email?.split("@")[0]
      || "Jogador";
  }

  function selectedGame() {
    return state.games.find(game => String(game.id) === String(state.selectedGameId)) || null;
  }

  function setFeedback(message = "", type = "") {
    elements.feedback.textContent = message;
    elements.feedback.className = `community-feedback${type ? ` ${type}` : ""}`;
  }

  function setLoading() {
    elements.comments.innerHTML = '<div class="community-loading">Carregando comentários...</div>';
  }

  function updateFormState() {
    const loggedIn = Boolean(state.user);
    elements.authNotice.classList.toggle("hidden", loggedIn);
    elements.submit.disabled = !loggedIn;
    elements.message.disabled = !loggedIn;
    elements.gameSelect.disabled = !loggedIn;
    document.querySelectorAll('input[name="reaction"]').forEach(input => { input.disabled = !loggedIn; });
    elements.currentUser.textContent = loggedIn ? displayName(state.user).toLocaleUpperCase("pt-BR") : "VISITANTE";
  }

  function populateGames() {
    const options = state.games.map(game =>
      `<option value="${escapeHtml(game.id)}">${escapeHtml(game.nome)} — ${escapeHtml(game.console || "Jogo")}</option>`
    ).join("");

    elements.gameFilter.innerHTML = `<option value="">Todos os jogos</option>${options}`;
    elements.gameSelect.innerHTML = `<option value="">Escolha um jogo</option>${options}`;

    if (state.selectedGameId && !state.games.some(game => String(game.id) === String(state.selectedGameId))) {
      state.selectedGameId = "";
    }
    elements.gameFilter.value = state.selectedGameId;
    elements.gameSelect.value = state.selectedGameId;
    updateFilterLabel();
  }

  function updateFilterLabel() {
    const game = selectedGame();
    elements.filterLabel.textContent = game ? game.nome.toLocaleUpperCase("pt-BR") : "TODOS OS JOGOS";
  }

  function updateUrl() {
    const url = new URL(location.href);
    if (state.selectedGameId) url.searchParams.set("jogo", state.selectedGameId);
    else url.searchParams.delete("jogo");
    history.replaceState({}, "", url);
  }

  async function loadCatalog() {
    const response = await fetch("./dados/games.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Não foi possível carregar o catálogo (${response.status}).`);
    const games = await response.json();
    if (!Array.isArray(games)) throw new Error("O catálogo de jogos está inválido.");
    state.games = [...games].sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
    populateGames();
  }

  function renderComments() {
    const rows = state.comments;
    elements.commentTotal.textContent = `${rows.length} ${rows.length === 1 ? "COMENTÁRIO" : "COMENTÁRIOS"}`;

    if (!rows.length) {
      elements.comments.innerHTML = `
        <div class="community-empty">
          <div><strong>Nenhum comentário encontrado.</strong><br>Escolha outro jogo ou publique a primeira opinião.</div>
        </div>`;
      return;
    }

    elements.comments.innerHTML = rows.map(row => {
      const online = state.onlineUserIds.has(String(row.user_id));
      const canDelete = state.user && String(state.user.id) === String(row.user_id);
      const seed = Number(row.avatar_seed) || hashText(row.user_id || row.display_name);
      return `
        <article class="community-comment" data-comment-id="${escapeHtml(row.id)}" data-comment-user="${escapeHtml(row.user_id)}">
          <div class="community-comment-avatar-wrap">
            <img class="community-comment-avatar" src="${avatarData(seed)}" alt="Avatar retrô de ${escapeHtml(row.display_name)}">
            <span class="community-status-text ${online ? "online" : ""}">${online ? "● ONLINE" : "● OFFLINE"}</span>
          </div>
          <div class="community-comment-main">
            <div class="community-comment-head">
              <div class="community-comment-user">
                <strong>${escapeHtml(row.display_name || "Jogador")}</strong>
                <a class="community-comment-game" href="comunidade.html?jogo=${encodeURIComponent(row.game_id)}">🎮 ${escapeHtml(row.game_name || row.game_id || "Jogo")}</a>
              </div>
              <span class="community-comment-time">${timeLabel(row.created_at)}</span>
            </div>
            <p class="community-comment-message">${escapeHtml(row.message)}</p>
            <div class="community-comment-actions">
              <span class="community-reaction-badge">${reactionLabel(row.reaction)}</span>
              ${canDelete ? `<button class="community-delete" type="button" data-delete-comment="${escapeHtml(row.id)}">EXCLUIR</button>` : ""}
            </div>
          </div>
        </article>`;
    }).join("");
  }

  function refreshOnlineUi() {
    document.querySelectorAll("[data-comment-user]").forEach(card => {
      const online = state.onlineUserIds.has(String(card.dataset.commentUser));
      const label = card.querySelector(".community-status-text");
      if (!label) return;
      label.textContent = online ? "● ONLINE" : "● OFFLINE";
      label.classList.toggle("online", online);
    });
    const total = state.onlineUserIds.size;
    elements.onlineTotal.textContent = `${total} ${total === 1 ? "jogador online" : "jogadores online"}`;
  }

  async function loadComments() {
    if (!client) {
      elements.comments.innerHTML = '<div class="community-error">Supabase não foi inicializado.</div>';
      return;
    }
    setLoading();

    let query = client
      .from("community_comments")
      .select("id,user_id,display_name,avatar_seed,game_id,game_name,reaction,message,created_at")
      .order("created_at", { ascending: false })
      .limit(MAX_COMMENTS);

    if (state.selectedGameId) query = query.eq("game_id", state.selectedGameId);
    const { data, error } = await query;

    if (error) {
      console.warn("Comunidade indisponível:", error.message);
      elements.comments.innerHTML = `
        <div class="community-error">
          <div><strong>A comunidade ainda não foi ativada no Supabase.</strong><br>Execute o arquivo <code>SUPABASE-COMUNIDADE-1.0.sql</code>.</div>
        </div>`;
      elements.commentTotal.textContent = "INDISPONÍVEL";
      return;
    }

    state.comments = data || [];
    renderComments();
    refreshOnlineUi();
  }

  function scheduleReload() {
    clearTimeout(state.reloadTimer);
    state.reloadTimer = setTimeout(loadComments, 250);
  }

  async function connectCommentsRealtime() {
    if (!client || state.commentsChannel) return;
    state.commentsChannel = client
      .channel("retroplay-community-comments-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "community_comments" }, scheduleReload)
      .subscribe();
  }

  function syncPresence() {
    if (!state.presenceChannel) return;
    state.onlineUserIds.clear();
    const presenceState = state.presenceChannel.presenceState();
    Object.entries(presenceState).forEach(([key, presences]) => {
      const userId = presences?.[0]?.user_id || key;
      if (userId && !String(userId).startsWith("visitante-")) {
        state.onlineUserIds.add(String(userId));
      }
    });
    refreshOnlineUi();
  }

  async function connectPresence() {
    if (!client) return;
    if (state.presenceChannel) {
      await client.removeChannel(state.presenceChannel);
      state.presenceChannel = null;
    }

    const randomPart = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    const key = state.user?.id || `visitante-${randomPart}`;
    const channel = client.channel(PRESENCE_CHANNEL, { config: { presence: { key } } });
    state.presenceChannel = channel;

    channel.on("presence", { event: "sync" }, syncPresence);
    channel.subscribe(async status => {
      if (status === "SUBSCRIBED" && state.user?.id) {
        await channel.track({ user_id: state.user.id, online_at: new Date().toISOString() });
      }
    });
  }

  async function publishComment(event) {
    event.preventDefault();
    if (!state.user) {
      setFeedback("Entre na sua conta para publicar.", "error");
      return;
    }

    const gameId = elements.gameSelect.value;
    const game = state.games.find(item => String(item.id) === String(gameId));
    const message = elements.message.value.trim();
    const reaction = document.querySelector('input[name="reaction"]:checked')?.value || "neutro";

    if (!game) {
      setFeedback("Escolha o jogo relacionado ao comentário.", "error");
      elements.gameSelect.focus();
      return;
    }
    if (message.length < 2) {
      setFeedback("Escreva pelo menos 2 caracteres.", "error");
      elements.message.focus();
      return;
    }

    elements.submit.disabled = true;
    elements.submit.textContent = "PUBLICANDO...";
    setFeedback("");

    const { error } = await client.from("community_comments").insert({
      user_id: state.user.id,
      display_name: displayName(state.user).slice(0, 40),
      avatar_seed: hashText(state.user.id) % 2147483647,
      game_id: String(game.id),
      game_name: String(game.nome).slice(0, 100),
      reaction,
      message
    });

    elements.submit.textContent = "PUBLICAR COMENTÁRIO ▶";
    elements.submit.disabled = false;

    if (error) {
      console.error(error);
      setFeedback(error.message || "Não foi possível publicar.", "error");
      return;
    }

    elements.message.value = "";
    elements.charCount.textContent = "0/400";
    state.selectedGameId = String(game.id);
    elements.gameFilter.value = state.selectedGameId;
    updateFilterLabel();
    updateUrl();
    setFeedback("Comentário publicado!", "success");
    await loadComments();
  }

  async function deleteComment(id) {
    if (!state.user || !confirm("Excluir este comentário?")) return;
    const { error } = await client
      .from("community_comments")
      .delete()
      .eq("id", id)
      .eq("user_id", state.user.id);

    if (error) {
      setFeedback(error.message || "Não foi possível excluir.", "error");
      return;
    }
    setFeedback("Comentário excluído.", "success");
    await loadComments();
  }

  function bindEvents() {
    elements.message.addEventListener("input", () => {
      elements.charCount.textContent = `${elements.message.value.length}/400`;
    });

    elements.form.addEventListener("submit", publishComment);
    elements.refresh.addEventListener("click", loadComments);

    elements.gameFilter.addEventListener("change", async () => {
      state.selectedGameId = elements.gameFilter.value;
      if (state.selectedGameId) elements.gameSelect.value = state.selectedGameId;
      updateFilterLabel();
      updateUrl();
      await loadComments();
    });

    elements.comments.addEventListener("click", event => {
      const button = event.target.closest("[data-delete-comment]");
      if (button) deleteComment(button.dataset.deleteComment);
    });
  }

  async function initialize() {
    bindEvents();
    updateFormState();

    if (!client) {
      elements.comments.innerHTML = '<div class="community-error">Servidor da comunidade indisponível.</div>';
      return;
    }

    try {
      await loadCatalog();
    } catch (error) {
      console.error(error);
      setFeedback(error.message, "error");
    }

    window.RetroPlayAuth?.onChange?.(async user => {
      state.user = user || null;
      updateFormState();
      renderComments();
      await connectPresence();
    });

    await connectCommentsRealtime();
    await loadComments();
  }

  initialize();
})();
