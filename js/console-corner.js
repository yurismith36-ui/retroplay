// RetroPlay Comunidade 1.0 — substitui o antigo destaque por uma prévia leve
(() => {
  "use strict";

  const PREVIEW_LIMIT = 3;
  const PRESENCE_CHANNEL = "retroplay-community-presence";
  const client = window.retroplaySupabase;
  const onlineUserIds = new Set();
  let presenceChannel = null;

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
    return "💬 Comentário";
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
    return date.toLocaleDateString("pt-BR");
  }

  function injectStyles() {
    if (document.querySelector('link[data-community-preview="1"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/comunidade-preview.css?v=community-1-0";
    link.dataset.communityPreview = "1";
    document.head.append(link);
  }

  function buildShell() {
    const windowElement = document.querySelector(".featured-window");
    if (!windowElement) return null;
    windowElement.classList.add("community-preview-window");
    windowElement.innerHTML = `
      <div class="window-title">
        <span>👾 COMUNIDADE RETROPLAY</span>
        <span id="community-online-count">0 ONLINE</span>
      </div>
      <div class="community-preview-intro">
        <strong>O QUE OS JOGADORES ESTÃO DIZENDO</strong>
        <span>Os 3 comentários mais recentes</span>
      </div>
      <div class="community-preview-body">
        <div id="community-preview-list" class="community-preview-list">
          <div class="community-preview-loading">Carregando a comunidade...</div>
        </div>
        <aside class="community-preview-side">
          <div class="community-preview-icon" aria-hidden="true">🕹️</div>
          <h2>ENTRE NA CONVERSA</h2>
          <p>Leia opiniões por jogo, diga se gostou e converse sem carregar o emulador.</p>
          <a class="purple-button community-enter-button" href="comunidade.html" data-open-community>ENTRAR NA COMUNIDADE ▶</a>
        </aside>
      </div>`;
    return windowElement;
  }

  function renderComments(rows) {
    const list = document.querySelector("#community-preview-list");
    if (!list) return;
    if (!rows.length) {
      list.innerHTML = `
        <div class="community-preview-empty">
          <div><strong>A comunidade está pronta!</strong><br>Seja a primeira pessoa a comentar sobre um jogo.</div>
        </div>`;
      return;
    }

    list.innerHTML = rows.map(row => {
      const online = onlineUserIds.has(String(row.user_id));
      const seed = Number(row.avatar_seed) || hashText(row.user_id || row.display_name);
      return `
        <article class="community-preview-card" data-comment-user="${escapeHtml(row.user_id)}">
          <img class="community-preview-avatar" src="${avatarData(seed)}" alt="Avatar retrô de ${escapeHtml(row.display_name)}">
          <div class="community-preview-content">
            <div class="community-preview-userline">
              <span class="community-status-dot ${online ? "online" : ""}" aria-label="${online ? "Online agora" : "Offline"}"></span>
              <strong>${escapeHtml(row.display_name || "Jogador")}</strong>
              <span class="community-preview-game">🎮 ${escapeHtml(row.game_name || row.game_id || "Jogo")}</span>
            </div>
            <p class="community-preview-message">${escapeHtml(row.message)}</p>
            <div class="community-preview-meta">
              <span class="community-reaction">${reactionLabel(row.reaction)}</span>
              <span>${timeLabel(row.created_at)}</span>
            </div>
          </div>
        </article>`;
    }).join("");
  }

  function refreshOnlineUi() {
    document.querySelectorAll("[data-comment-user]").forEach(card => {
      const dot = card.querySelector(".community-status-dot");
      const online = onlineUserIds.has(String(card.dataset.commentUser));
      dot?.classList.toggle("online", online);
      dot?.setAttribute("aria-label", online ? "Online agora" : "Offline");
    });
    const count = document.querySelector("#community-online-count");
    if (count) count.textContent = `${onlineUserIds.size} ONLINE`;
  }

  function syncPresence(channel) {
    onlineUserIds.clear();
    const state = channel.presenceState();
    Object.entries(state).forEach(([key, presences]) => {
      const userId = presences?.[0]?.user_id || key;
      if (userId && !String(userId).startsWith("visitante-")) onlineUserIds.add(String(userId));
    });
    refreshOnlineUi();
  }

  async function connectPresence(user) {
    if (!client || presenceChannel) return;
    const key = user?.id || `visitante-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
    presenceChannel = client.channel(PRESENCE_CHANNEL, { config: { presence: { key } } });
    presenceChannel.on("presence", { event: "sync" }, () => syncPresence(presenceChannel));
    presenceChannel.subscribe(async status => {
      if (status === "SUBSCRIBED" && user?.id) {
        await presenceChannel.track({ user_id: user.id, online_at: new Date().toISOString() });
      }
    });
  }

  async function loadPreview() {
    const list = document.querySelector("#community-preview-list");
    if (!client) {
      if (list) list.innerHTML = '<div class="community-preview-error">Servidor da comunidade indisponível.</div>';
      return;
    }

    const { data, error } = await client
      .from("community_comments")
      .select("id,user_id,display_name,avatar_seed,game_id,game_name,reaction,message,created_at")
      .order("created_at", { ascending: false })
      .limit(PREVIEW_LIMIT);

    if (error) {
      console.warn("Comunidade ainda não ativada:", error.message);
      if (list) {
        list.innerHTML = `
          <div class="community-preview-error">
            <div><strong>Falta ativar o banco da comunidade.</strong><br>Execute o arquivo SQL incluído nesta atualização.</div>
          </div>`;
      }
      return;
    }
    renderComments(data || []);
  }

  function bindNavigation() {
    document.querySelectorAll("[data-open-community]").forEach(link => {
      link.addEventListener("click", event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const overlay = document.createElement("div");
        overlay.className = "community-page-loading";
        overlay.textContent = "CARREGANDO COMUNIDADE...";
        document.body.append(overlay);
        requestAnimationFrame(() => location.assign(link.href));
      });
    });
  }

  async function initialize() {
    injectStyles();
    if (!buildShell()) return;
    bindNavigation();
    await loadPreview();

    const user = window.RetroPlayAuth?.getUser?.() || null;
    await connectPresence(user);
    window.addEventListener("retroplay-auth-changed", async event => {
      if (presenceChannel && client) {
        await client.removeChannel(presenceChannel);
        presenceChannel = null;
      }
      await connectPresence(event.detail?.user || null);
    });

    if (client) {
      client.channel("retroplay-community-preview-updates")
        .on("postgres_changes", { event: "*", schema: "public", table: "community_comments" }, loadPreview)
        .subscribe();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
