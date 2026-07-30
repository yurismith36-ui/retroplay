const ARENA_NAME_KEY = "retroplay-arena-nickname";
const ARENA_TOKEN_KEY = "retroplay-arena-online-token";
const ARENA_ACTIVE_KEY = "retroplay-arena-online-active-code";
const ARENA_INVITE_SEEN_KEY = "retroplay-arena-invite-seen";
const ROOM_REFRESH_MS = 8000;

const inviteParams = new URLSearchParams(location.search);
const inviteCodeAtBoot = cleanCode(inviteParams.get("codigo") || "");

// Ao abrir o link de convite em outra aba, cria uma identidade nova para permitir
// o teste como Jogador 2 no mesmo navegador. A atualização da própria aba mantém o token.
if (
  inviteCodeAtBoot &&
  inviteParams.get("convite") === "1" &&
  sessionStorage.getItem(ARENA_INVITE_SEEN_KEY) !== inviteCodeAtBoot
) {
  sessionStorage.removeItem(ARENA_TOKEN_KEY);
  sessionStorage.setItem(ARENA_INVITE_SEEN_KEY, inviteCodeAtBoot);
}

const playerToken = getOrCreatePlayerToken();
const client = window.retroplaySupabase || null;

const state = {
  games: [],
  publicRooms: [],
  activeRoom: null,
  messages: [],
  lobbyChannel: null,
  roomChannel: null,
  presenceCount: 0,
  serverReady: false,
  redirecting: false,
  refreshTimer: null
};

const elements = {
  nickname: document.querySelector("#arena-nickname"),
  saveNickname: document.querySelector("#save-nickname"),
  codeInput: document.querySelector("#room-code-input"),
  openCode: document.querySelector("#open-room-code"),
  refresh: document.querySelector("#arena-refresh"),
  headerMessage: document.querySelector("#arena-header-message"),
  serverStatus: document.querySelector("#arena-server-status"),
  serverTitle: document.querySelector("#arena-server-title"),
  serverDetail: document.querySelector("#arena-server-detail"),
  notice: document.querySelector("#arena-notice"),
  inviteBanner: document.querySelector("#invite-banner"),
  gameSelect: document.querySelector("#arena-game-select"),
  privateRoom: document.querySelector("#arena-private-room"),
  createRoom: document.querySelector("#create-online-room"),
  rooms: document.querySelector("#arena-rooms"),
  roomSummary: document.querySelector("#arena-room-summary"),
  activePanel: document.querySelector("#active-room-panel"),
  activeHeading: document.querySelector("#active-room-heading"),
  activeStatus: document.querySelector("#active-room-status"),
  activeCode: document.querySelector("#active-room-code"),
  activeCover: document.querySelector("#active-game-cover"),
  activeGameName: document.querySelector("#active-game-name"),
  activeGameMeta: document.querySelector("#active-game-meta"),
  hostSlot: document.querySelector("#host-slot"),
  guestSlot: document.querySelector("#guest-slot"),
  hostName: document.querySelector("#host-name"),
  guestName: document.querySelector("#guest-name"),
  hostReady: document.querySelector("#host-ready"),
  guestReady: document.querySelector("#guest-ready"),
  presenceCount: document.querySelector("#active-presence-count"),
  inviteLink: document.querySelector("#active-invite-link"),
  copyInvite: document.querySelector("#copy-invite"),
  shareInvite: document.querySelector("#share-invite"),
  refreshActive: document.querySelector("#refresh-active-room"),
  toggleReady: document.querySelector("#toggle-ready"),
  leaveRoom: document.querySelector("#leave-room"),
  closePanel: document.querySelector("#close-room-panel"),
  chatMessages: document.querySelector("#arena-chat-messages"),
  chatForm: document.querySelector("#arena-chat-form"),
  chatInput: document.querySelector("#arena-chat-input"),
  startGame: document.querySelector("#start-online-game"),
  startHelp: document.querySelector("#arena-start-help")
};

function cleanCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-F0-9]/g, "")
    .slice(0, 6);
}

function randomUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  if (!bytes.some(Boolean)) {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function getOrCreatePlayerToken() {
  let token = sessionStorage.getItem(ARENA_TOKEN_KEY);
  if (!token) {
    token = randomUuid();
    sessionStorage.setItem(ARENA_TOKEN_KEY, token);
  }
  return token;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function placeholderCover(title) {
  const safeTitle = escapeHtml(title).slice(0, 24);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <rect width="100%" height="100%" fill="#1d1723"/>
    <rect x="24" y="24" width="752" height="552" rx="24" fill="#e7e4eb" stroke="#5b3477" stroke-width="13"/>
    <rect x="55" y="55" width="690" height="80" fill="#4d2d68"/>
    <text x="400" y="106" text-anchor="middle" fill="#fff" font-family="monospace" font-size="34" font-weight="bold">RETROPLAY ARENA</text>
    <text x="400" y="305" text-anchor="middle" fill="#4d2d68" font-family="monospace" font-size="36" font-weight="bold">${safeTitle}</text>
    <text x="400" y="380" text-anchor="middle" fill="#6d6874" font-family="sans-serif" font-size="23">CAPA NÃO ENCONTRADA</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function normalizeRoom(room) {
  if (!room || typeof room !== "object") return null;
  return {
    code: cleanCode(room.code),
    game_id: String(room.game_id || ""),
    game_name: String(room.game_name || "Jogo"),
    game_console: String(room.game_console || "Console"),
    game_cover: String(room.game_cover || ""),
    host_name: String(room.host_name || "Jogador 1"),
    guest_name: room.guest_name ? String(room.guest_name) : "",
    host_ready: Boolean(room.host_ready),
    guest_ready: Boolean(room.guest_ready),
    is_private: Boolean(room.is_private),
    status: String(room.status || "waiting"),
    viewer_role: String(room.viewer_role || ""),
    created_at: room.created_at || "",
    updated_at: room.updated_at || "",
    expires_at: room.expires_at || ""
  };
}

function friendlyError(error) {
  const raw = String(error?.message || error || "Erro desconhecido");
  if (/arena_create_room|arena_list_rooms|arena_get_room|PGRST202|Could not find the function/i.test(raw)) {
    return "A Arena ainda não foi ativada no Supabase. Execute o arquivo SUPABASE-ARENA-ONLINE-1.0.sql.";
  }

  const known = {
    SALA_NAO_ENCONTRADA: "A sala não foi encontrada ou expirou.",
    SALA_CHEIA: "A sala já possui dois jogadores.",
    DIGITE_UM_NOME: "Digite um nome com pelo menos 2 caracteres.",
    ESCOLHA_UM_JOGO: "Escolha um jogo para criar a sala.",
    IDENTIFICACAO_INVALIDA: "Não foi possível identificar este aparelho.",
    VOCE_NAO_ESTA_NESTA_SALA: "Você não está mais nesta sala.",
    SOMENTE_O_ANFITRIAO_PODE_INICIAR: "Somente o anfitrião pode iniciar o jogo.",
    OS_DOIS_JOGADORES_PRECISAM_ESTAR_PRONTOS: "Os dois jogadores precisam estar prontos.",
    MENSAGEM_VAZIA: "Escreva uma mensagem antes de enviar."
  };

  const key = Object.keys(known).find(item => raw.includes(item));
  return key ? known[key] : raw.replace(/^.*message[: ]+/i, "");
}

function setServerStatus(type, title, detail) {
  elements.serverStatus.className = `server-status ${type}`;
  elements.serverTitle.textContent = title;
  elements.serverDetail.textContent = detail;
  elements.headerMessage.textContent = title;
}

function showNotice(message, type = "info", autoHide = false) {
  elements.notice.textContent = message;
  elements.notice.className = `arena-notice ${type}`;
  if (autoHide) {
    window.setTimeout(() => elements.notice.classList.add("hidden"), 3500);
  }
}

function hideNotice() {
  elements.notice.classList.add("hidden");
}

function setButtonBusy(button, busy, busyText = "AGUARDE...") {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    delete button.dataset.originalText;
  }
}

function requireNickname() {
  const name = elements.nickname.value.trim().slice(0, 24);
  if (name.length < 2) {
    elements.nickname.focus();
    showNotice("Digite seu nome na Arena antes de criar ou entrar em uma sala.", "error");
    return "";
  }
  localStorage.setItem(ARENA_NAME_KEY, name);
  return name;
}

function roomStatus(room) {
  if (!room.guest_name) return { key: "waiting", label: "1/2 — AGUARDANDO" };
  if (room.status === "playing") return { key: "playing", label: "JOGO INICIADO" };
  if (room.host_ready && room.guest_ready) return { key: "ready", label: "2/2 — PRONTOS" };
  return { key: "occupied", label: "2/2 — PREPARANDO" };
}

function gameById(gameId) {
  return state.games.find(game => game.id === gameId) || null;
}

function roomInviteUrl(room) {
  const url = new URL("salas.html", location.href);
  url.searchParams.set("codigo", room.code);
  url.searchParams.set("convite", "1");
  return url.toString();
}

async function rpc(name, params = {}) {
  if (!client) throw new Error("Supabase não foi carregado.");
  const { data, error } = await client.rpc(name, params);
  if (error) throw error;
  return data;
}

async function loadCatalog() {
  const response = await fetch("./dados/games.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Não foi possível carregar os jogos: HTTP ${response.status}`);
  const games = await response.json();
  if (!Array.isArray(games)) throw new Error("O arquivo dados/games.json está inválido.");

  state.games = [...games].sort((a, b) => {
    const score = game => {
      let value = 0;
      if (/luta/i.test(game.genero || "")) value += 20;
      if (/snes/i.test(game.console || "")) value += 10;
      return value;
    };
    return score(b) - score(a) || Number(a.ordem || 0) - Number(b.ordem || 0);
  });

  elements.gameSelect.innerHTML = state.games.map(game => {
    const multiplayerHint = /luta|coop|tiro/i.test(`${game.genero || ""} ${game.descricao || ""}`) ? " ★" : "";
    return `<option value="${escapeHtml(game.id)}">${escapeHtml(game.nome)} — ${escapeHtml(game.console)}${multiplayerHint}</option>`;
  }).join("");
}

async function refreshPublicRooms({ silent = false } = {}) {
  if (!client) return;
  try {
    const data = await rpc("arena_list_rooms");
    state.publicRooms = Array.isArray(data) ? data.map(normalizeRoom).filter(Boolean) : [];
    renderRooms();
    if (!silent) hideNotice();
  } catch (error) {
    console.error(error);
    state.publicRooms = [];
    renderRooms();
    setServerStatus("error", "ARENA AINDA NÃO ATIVADA", "Execute o arquivo SQL fornecido no Supabase.");
    showNotice(friendlyError(error), "error");
  }
}

async function fetchRoom(code) {
  const data = await rpc("arena_get_room", {
    p_code: cleanCode(code),
    p_player_token: playerToken
  });
  return normalizeRoom(data);
}

async function createRoom() {
  const nickname = requireNickname();
  if (!nickname) return;

  const game = gameById(elements.gameSelect.value);
  if (!game) {
    showNotice("Escolha um jogo para criar a sala.", "error");
    return;
  }

  setButtonBusy(elements.createRoom, true, "CRIANDO SALA...");
  hideNotice();

  try {
    const data = await rpc("arena_create_room", {
      p_game_id: game.id,
      p_game_name: game.nome,
      p_game_console: game.console,
      p_game_cover: game.capa || "",
      p_host_name: nickname,
      p_host_token: playerToken,
      p_is_private: Boolean(elements.privateRoom.checked)
    });

    const room = normalizeRoom(data);
    await openActiveRoom(room);
    await notifyLobby();
    showNotice(`Sala ${room.code} criada! Agora copie o link e envie ao seu amigo.`, "success", true);
    elements.activePanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    console.error(error);
    showNotice(friendlyError(error), "error");
  } finally {
    setButtonBusy(elements.createRoom, false);
  }
}

async function joinRoom(code) {
  const nickname = requireNickname();
  if (!nickname) return;

  const roomCode = cleanCode(code);
  if (roomCode.length !== 6) {
    showNotice("Digite o código completo de 6 caracteres.", "error");
    return;
  }

  setButtonBusy(elements.openCode, true, "ENTRANDO...");
  hideNotice();

  try {
    let room = await fetchRoom(roomCode);
    if (!room) throw new Error("SALA_NAO_ENCONTRADA");

    if (!room.viewer_role) {
      const data = await rpc("arena_join_room", {
        p_code: roomCode,
        p_guest_name: nickname,
        p_guest_token: playerToken
      });
      room = normalizeRoom(data);
      await notifyLobby();
      showNotice(`Você entrou na sala ${roomCode}.`, "success", true);
    }

    await openActiveRoom(room);
    await notifyRoom("room-updated", { code: roomCode });
    elements.activePanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    console.error(error);
    showNotice(friendlyError(error), "error");
  } finally {
    setButtonBusy(elements.openCode, false);
  }
}

async function openActiveRoom(room) {
  if (!room) return;
  state.activeRoom = room;
  sessionStorage.setItem(ARENA_ACTIVE_KEY, room.code);
  renderActiveRoom();
  await subscribeRoom(room.code);
  await loadMessages();
  await renderInviteBanner();
}

async function refreshActiveRoom({ silent = false } = {}) {
  if (!state.activeRoom?.code) return;
  try {
    const previousStatus = state.activeRoom.status;
    const room = await fetchRoom(state.activeRoom.code);
    if (!room) {
      clearActiveRoom("A sala foi encerrada ou expirou.");
      return;
    }

    state.activeRoom = room;
    renderActiveRoom();
    if (previousStatus !== "playing" && room.status === "playing") {
      scheduleGameOpen(room);
    }
    if (!silent) hideNotice();
  } catch (error) {
    console.error(error);
    if (!silent) showNotice(friendlyError(error), "error");
  }
}

function clearActiveRoom(message = "") {
  if (state.roomChannel && client) {
    client.removeChannel(state.roomChannel);
  }
  state.roomChannel = null;
  state.activeRoom = null;
  state.messages = [];
  state.presenceCount = 0;
  sessionStorage.removeItem(ARENA_ACTIVE_KEY);
  elements.activePanel.classList.add("hidden");
  renderMessages();
  if (message) showNotice(message, "info", true);
}

async function toggleReady() {
  const room = state.activeRoom;
  if (!room?.viewer_role) return;
  const current = room.viewer_role === "host" ? room.host_ready : room.guest_ready;
  setButtonBusy(elements.toggleReady, true, "SALVANDO...");

  try {
    const data = await rpc("arena_set_ready", {
      p_code: room.code,
      p_player_token: playerToken,
      p_ready: !current
    });
    state.activeRoom = normalizeRoom(data);
    renderActiveRoom();
    await notifyRoom("room-updated", { code: room.code });
    await notifyLobby();
  } catch (error) {
    console.error(error);
    showNotice(friendlyError(error), "error");
  } finally {
    setButtonBusy(elements.toggleReady, false);
    renderActiveRoom();
  }
}

async function leaveRoom() {
  const room = state.activeRoom;
  if (!room?.viewer_role) {
    clearActiveRoom();
    return;
  }

  if (room.viewer_role === "host") {
    const confirmed = confirm("Encerrar esta sala para todos os jogadores?");
    if (!confirmed) return;
  }

  setButtonBusy(elements.leaveRoom, true, "SAINDO...");
  try {
    await rpc("arena_leave_room", {
      p_code: room.code,
      p_player_token: playerToken
    });
    await notifyRoom("room-updated", { code: room.code, closed: room.viewer_role === "host" });
    await notifyLobby();
    clearActiveRoom(room.viewer_role === "host" ? "Sala encerrada." : "Você saiu da sala.");
    await refreshPublicRooms({ silent: true });
  } catch (error) {
    console.error(error);
    showNotice(friendlyError(error), "error");
  } finally {
    setButtonBusy(elements.leaveRoom, false);
  }
}

async function startGame() {
  const room = state.activeRoom;
  if (!room || room.viewer_role !== "host") return;

  setButtonBusy(elements.startGame, true, "INICIANDO NOS DOIS...");
  try {
    const data = await rpc("arena_start_game", {
      p_code: room.code,
      p_player_token: playerToken
    });
    state.activeRoom = normalizeRoom(data);
    renderActiveRoom();
    await notifyRoom("game-started", {
      code: room.code,
      game_id: room.game_id,
      started_at: Date.now()
    });
    await notifyLobby();
    scheduleGameOpen(state.activeRoom);
  } catch (error) {
    console.error(error);
    showNotice(friendlyError(error), "error");
    setButtonBusy(elements.startGame, false);
    renderActiveRoom();
  }
}

function scheduleGameOpen(room) {
  if (state.redirecting || !room?.game_id || !room.viewer_role) return;
  state.redirecting = true;
  showNotice("O anfitrião iniciou. Abrindo o jogo neste aparelho...", "success");
  window.setTimeout(() => {
    const url = new URL("player.html", location.href);
    url.searchParams.set("id", room.game_id);
    url.searchParams.set("arena", "online");
    url.searchParams.set("codigo", room.code);
    url.searchParams.set("papel", room.viewer_role);
    location.href = url.toString();
  }, 1100);
}

async function loadMessages() {
  const room = state.activeRoom;
  if (!room?.viewer_role) {
    state.messages = [];
    renderMessages();
    return;
  }

  try {
    const data = await rpc("arena_list_messages", {
      p_code: room.code,
      p_player_token: playerToken
    });
    state.messages = Array.isArray(data) ? data : [];
    renderMessages();
  } catch (error) {
    console.error(error);
    state.messages = [];
    renderMessages();
  }
}

async function sendMessage(event) {
  event.preventDefault();
  const room = state.activeRoom;
  const message = elements.chatInput.value.trim();
  if (!room?.viewer_role || !message) return;

  const button = elements.chatForm.querySelector("button");
  setButtonBusy(button, true, "ENVIANDO...");
  try {
    await rpc("arena_send_message", {
      p_code: room.code,
      p_player_token: playerToken,
      p_message: message
    });
    elements.chatInput.value = "";
    await loadMessages();
    await notifyRoom("chat-message", { code: room.code });
  } catch (error) {
    console.error(error);
    showNotice(friendlyError(error), "error");
  } finally {
    setButtonBusy(button, false);
  }
}

function renderMessages() {
  if (!state.activeRoom?.viewer_role) {
    elements.chatMessages.innerHTML = '<div class="arena-chat-empty">Entre na sala para conversar.</div>';
    elements.chatInput.disabled = true;
    elements.chatForm.querySelector("button").disabled = true;
    return;
  }

  elements.chatInput.disabled = false;
  elements.chatForm.querySelector("button").disabled = false;

  if (!state.messages.length) {
    elements.chatMessages.innerHTML = '<div class="arena-chat-empty">Nenhuma mensagem ainda. Diga olá para seu amigo!</div>';
    return;
  }

  elements.chatMessages.innerHTML = state.messages.map(item => {
    const time = item.created_at
      ? new Date(item.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : "";
    return `<article class="arena-chat-message">
      <header><strong>${escapeHtml(item.sender_name || "Jogador")}</strong><time>${escapeHtml(time)}</time></header>
      <p>${escapeHtml(item.message || "")}</p>
    </article>`;
  }).join("");
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

async function copyInvite() {
  const room = state.activeRoom;
  if (!room) return;
  const link = roomInviteUrl(room);
  elements.inviteLink.value = link;

  let copied = false;
  try {
    await navigator.clipboard.writeText(link);
    copied = true;
  } catch (error) {
    elements.inviteLink.focus();
    elements.inviteLink.select();
    try { copied = document.execCommand("copy"); } catch (fallbackError) { copied = false; }
  }

  const original = elements.copyInvite.textContent;
  elements.copyInvite.textContent = copied ? "LINK COPIADO!" : "SELECIONE E COPIE";
  window.setTimeout(() => { elements.copyInvite.textContent = original; }, 1800);
}

async function shareInvite() {
  const room = state.activeRoom;
  if (!room) return;
  const link = roomInviteUrl(room);
  const text = `${room.host_name} convidou você para jogar ${room.game_name} no RetroPlay. Código: ${room.code}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: "Convite RetroPlay Arena", text, url: link });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  await copyInvite();
}

function renderRooms() {
  elements.roomSummary.textContent = state.publicRooms.length
    ? `${state.publicRooms.length} ${state.publicRooms.length === 1 ? "SALA" : "SALAS"}`
    : "NENHUMA SALA";

  if (!state.publicRooms.length) {
    elements.rooms.innerHTML = `
      <div class="arena-empty-state">
        <strong>NENHUMA SALA PÚBLICA AGORA</strong>
        <span>Crie uma sala acima ou entre pelo link enviado por um amigo.</span>
      </div>`;
    return;
  }

  elements.rooms.innerHTML = state.publicRooms.map(room => {
    const status = roomStatus(room);
    const cover = room.game_cover || placeholderCover(room.game_name);
    const full = Boolean(room.guest_name);
    const isCurrent = state.activeRoom?.code === room.code;
    return `<article class="arena-room-card ${status.key}">
      <header>
        <div><small>SALA</small><strong>${escapeHtml(room.code)}</strong></div>
        <span class="room-status-pill ${status.key}">${status.label}</span>
      </header>
      <div class="room-card-body">
        <div class="room-game-preview">
          <img src="${escapeHtml(cover)}" alt="Capa de ${escapeHtml(room.game_name)}"
               onerror="this.onerror=null;this.src='${placeholderCover(room.game_name)}'">
          <div>
            <strong>${escapeHtml(room.game_name)}</strong>
            <small>${escapeHtml(room.game_console)}</small>
            <span>👤 ${escapeHtml(room.host_name)}</span>
            <span>${room.guest_name ? `👥 ${escapeHtml(room.guest_name)}` : "⌛ Esperando Jogador 2"}</span>
          </div>
        </div>
        <div class="room-card-actions">
          <button class="purple-button arena-button" data-room-code="${escapeHtml(room.code)}" type="button" ${full && !isCurrent ? "disabled" : ""}>
            ${isCurrent ? "ABRIR MINHA SALA" : (full ? "SALA CHEIA" : "ENTRAR")}
          </button>
        </div>
      </div>
      <footer><span>🌍 PÚBLICA</span><span>${room.guest_name ? "2 JOGADORES" : "1 JOGADOR"}</span></footer>
    </article>`;
  }).join("");

  elements.rooms.querySelectorAll("[data-room-code]").forEach(button => {
    button.addEventListener("click", () => {
      const code = button.dataset.roomCode;
      if (state.activeRoom?.code === code) {
        elements.activePanel.classList.remove("hidden");
        elements.activePanel.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        elements.codeInput.value = code;
        joinRoom(code);
      }
    });
  });
}

function renderActiveRoom() {
  const room = state.activeRoom;
  if (!room) {
    elements.activePanel.classList.add("hidden");
    return;
  }

  const status = roomStatus(room);
  const role = room.viewer_role;
  const bothReady = Boolean(room.guest_name && room.host_ready && room.guest_ready);
  const roleReady = role === "host" ? room.host_ready : room.guest_ready;

  elements.activePanel.classList.remove("hidden");
  elements.activeHeading.textContent = `🎮 SALA ${room.code}`;
  elements.activeStatus.textContent = status.label;
  elements.activeStatus.className = `room-status-pill ${status.key}`;
  elements.activeCode.textContent = room.code;
  elements.activeGameName.textContent = room.game_name;
  elements.activeGameMeta.textContent = `${room.game_console}${room.is_private ? " • SALA PRIVADA" : " • SALA PÚBLICA"}`;
  elements.activeCover.src = room.game_cover || placeholderCover(room.game_name);
  elements.activeCover.onerror = () => {
    elements.activeCover.onerror = null;
    elements.activeCover.src = placeholderCover(room.game_name);
  };
  elements.hostName.textContent = room.host_name;
  elements.guestName.textContent = room.guest_name || "Aguardando amigo...";
  elements.hostReady.textContent = room.host_ready ? "✓ PRONTO" : "NÃO PRONTO";
  elements.guestReady.textContent = room.guest_name
    ? (room.guest_ready ? "✓ PRONTO" : "NÃO PRONTO")
    : "SEM JOGADOR";
  elements.hostSlot.classList.toggle("ready", room.host_ready);
  elements.guestSlot.classList.toggle("ready", room.guest_ready);
  elements.inviteLink.value = roomInviteUrl(room);
  elements.presenceCount.textContent = `${state.presenceCount} ${state.presenceCount === 1 ? "conectado" : "conectados"} nesta sala`;

  elements.toggleReady.hidden = !role;
  elements.leaveRoom.hidden = !role;
  elements.copyInvite.hidden = role !== "host";
  elements.shareInvite.hidden = role !== "host";
  elements.toggleReady.textContent = roleReady ? "CANCELAR PRONTO" : "FICAR PRONTO";

  if (room.status === "playing") {
    elements.startGame.disabled = true;
    elements.startGame.textContent = "JOGO INICIADO";
    elements.startHelp.textContent = "O jogo foi aberto nos aparelhos conectados. Os controles ainda são locais nesta versão.";
  } else if (role === "host" && bothReady) {
    elements.startGame.disabled = false;
    elements.startGame.textContent = "ABRIR JOGO NOS DOIS (TESTE)";
    elements.startHelp.textContent = "Esta etapa abre o mesmo jogo nos dois aparelhos. O combate com controles sincronizados depende do servidor Netplay.";
  } else if (role === "guest" && bothReady) {
    elements.startGame.disabled = true;
    elements.startGame.textContent = "AGUARDANDO O ANFITRIÃO";
    elements.startHelp.textContent = "Os dois estão prontos. O Jogador 1 iniciará o jogo.";
  } else {
    elements.startGame.disabled = true;
    elements.startGame.textContent = room.guest_name ? "AGUARDANDO OS 2 PRONTOS" : "AGUARDANDO JOGADOR 2";
    elements.startHelp.textContent = "Quando os dois estiverem prontos, o anfitrião poderá abrir o mesmo jogo nos dois aparelhos. A sincronização dos controles será adicionada com o servidor Netplay.";
  }

  renderMessages();
}

async function renderInviteBanner() {
  const code = cleanCode(inviteParams.get("codigo") || "");
  if (!code) {
    elements.inviteBanner.classList.add("hidden");
    return;
  }

  try {
    const room = await fetchRoom(code);
    if (!room) {
      elements.inviteBanner.className = "arena-invite-banner expired";
      elements.inviteBanner.innerHTML = `<div><strong>⚠ CONVITE EXPIRADO</strong><span>A sala ${escapeHtml(code)} não existe mais.</span></div>`;
      return;
    }

    if (state.activeRoom?.code === code && state.activeRoom.viewer_role) {
      elements.inviteBanner.classList.add("hidden");
      return;
    }

    const full = Boolean(room.guest_name);
    elements.inviteBanner.className = "arena-invite-banner";
    elements.inviteBanner.innerHTML = `
      <div>
        <strong>🎟 CONVITE PARA A SALA ${escapeHtml(room.code)}</strong>
        <span>${escapeHtml(room.host_name)} convidou você para jogar ${escapeHtml(room.game_name)}.</span>
        <small>${escapeHtml(room.game_console)} • ${full ? "Sala com dois jogadores" : "Uma vaga disponível"}</small>
      </div>
      <button id="accept-invite" class="purple-button arena-button" type="button" ${full && !room.viewer_role ? "disabled" : ""}>
        ${room.viewer_role ? "ABRIR SALA" : (full ? "SALA CHEIA" : "ENTRAR NESTA SALA")}
      </button>`;

    document.querySelector("#accept-invite")?.addEventListener("click", () => {
      elements.codeInput.value = code;
      if (room.viewer_role) openActiveRoom(room);
      else joinRoom(code);
    });
  } catch (error) {
    console.error(error);
    elements.inviteBanner.className = "arena-invite-banner expired";
    elements.inviteBanner.innerHTML = `<div><strong>⚠ NÃO FOI POSSÍVEL ABRIR O CONVITE</strong><span>${escapeHtml(friendlyError(error))}</span></div>`;
  }
}

async function subscribeLobby() {
  if (!client) return;
  if (state.lobbyChannel) await client.removeChannel(state.lobbyChannel);

  await new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    state.lobbyChannel = client
      .channel("retroplay-arena-lobby-online-1", {
        config: { broadcast: { self: false } }
      })
      .on("broadcast", { event: "room-list-changed" }, () => {
        refreshPublicRooms({ silent: true });
      })
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          state.serverReady = true;
          setServerStatus("online", "SERVIDOR ONLINE", "Salas e convites estão conectados em tempo real.");
          finish();
        } else if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
          state.serverReady = false;
          setServerStatus("error", "CANAL EM TEMPO REAL INDISPONÍVEL", friendlyError(error || "A conexão será tentada novamente."));
          finish();
        } else if (status === "CLOSED" && navigator.onLine) {
          state.serverReady = false;
          setServerStatus("connecting", "RECONECTANDO...", "A lista continuará sendo atualizada automaticamente.");
        }
      });

    window.setTimeout(finish, 2500);
  });
}

async function notifyLobby() {
  if (!state.lobbyChannel) return;
  try {
    await state.lobbyChannel.send({
      type: "broadcast",
      event: "room-list-changed",
      payload: { at: Date.now() }
    });
  } catch (error) {
    console.warn("Não foi possível avisar o lobby.", error);
  }
  refreshPublicRooms({ silent: true });
}

async function subscribeRoom(code) {
  if (!client || !code) return;
  if (state.roomChannel) await client.removeChannel(state.roomChannel);

  state.presenceCount = 0;

  await new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    state.roomChannel = client
      .channel(`retroplay-arena-room-${code}`, {
        config: {
          broadcast: { self: true },
          presence: { key: playerToken }
        }
      })
      .on("broadcast", { event: "room-updated" }, async payload => {
        if (payload?.payload?.closed) {
          const room = await fetchRoom(code).catch(() => null);
          if (!room) {
            clearActiveRoom("O anfitrião encerrou a sala.");
            return;
          }
        }
        await refreshActiveRoom({ silent: true });
      })
      .on("broadcast", { event: "chat-message" }, () => loadMessages())
      .on("broadcast", { event: "game-started" }, async () => {
        await refreshActiveRoom({ silent: true });
        if (state.activeRoom?.status === "playing") scheduleGameOpen(state.activeRoom);
      })
      .on("presence", { event: "sync" }, () => {
        const presence = state.roomChannel?.presenceState?.() || {};
        state.presenceCount = Object.values(presence).reduce(
          (total, entries) => total + (Array.isArray(entries) ? entries.length : 0),
          0
        );
        renderActiveRoom();
      })
      .subscribe(async status => {
        if (status === "SUBSCRIBED") {
          try {
            await state.roomChannel.track({
              name: elements.nickname.value.trim() || "Jogador",
              role: state.activeRoom?.viewer_role || "visitante",
              online_at: new Date().toISOString()
            });
          } catch (error) {
            console.warn("Presence não foi registrada.", error);
          }
          finish();
        } else if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
          finish();
        }
      });

    window.setTimeout(finish, 2500);
  });
}

async function notifyRoom(event, payload = {}) {
  if (!state.roomChannel) return;
  try {
    await state.roomChannel.send({ type: "broadcast", event, payload });
  } catch (error) {
    console.warn(`Não foi possível transmitir ${event}.`, error);
  }
}

async function restoreRoom() {
  const code = inviteCodeAtBoot || cleanCode(sessionStorage.getItem(ARENA_ACTIVE_KEY) || "");
  if (!code) return;

  try {
    const room = await fetchRoom(code);
    if (room?.viewer_role) {
      await openActiveRoom(room);
      if (room.status === "playing") {
        showNotice("Você voltou para uma sala cujo jogo já foi iniciado.", "info", true);
      }
    }
  } catch (error) {
    console.warn("Não foi possível restaurar a sala.", error);
  }
}

async function initializeArena() {
  elements.nickname.value = localStorage.getItem(ARENA_NAME_KEY) || "";
  renderMessages();

  if (!client) {
    setServerStatus("error", "SUPABASE NÃO CARREGOU", "Verifique sua internet e o arquivo js/supabase.js.");
    showNotice("Não foi possível carregar o servidor da Arena.", "error");
    return;
  }

  try {
    await loadCatalog();
    await subscribeLobby();
    await refreshPublicRooms({ silent: true });
    await restoreRoom();
    await renderInviteBanner();

    state.refreshTimer = window.setInterval(async () => {
      if (!navigator.onLine) return;
      await refreshPublicRooms({ silent: true });
      await refreshActiveRoom({ silent: true });
    }, ROOM_REFRESH_MS);
  } catch (error) {
    console.error(error);
    setServerStatus("error", "ERRO AO ABRIR A ARENA", "Confira os arquivos e a configuração do Supabase.");
    showNotice(friendlyError(error), "error");
  }
}

elements.saveNickname.addEventListener("click", () => {
  const name = requireNickname();
  if (!name) return;
  const original = elements.saveNickname.textContent;
  elements.saveNickname.textContent = "NOME SALVO!";
  window.setTimeout(() => { elements.saveNickname.textContent = original; }, 1300);
});

elements.nickname.addEventListener("keydown", event => {
  if (event.key === "Enter") elements.saveNickname.click();
});

elements.codeInput.addEventListener("input", () => {
  elements.codeInput.value = cleanCode(elements.codeInput.value);
});

elements.codeInput.addEventListener("keydown", event => {
  if (event.key === "Enter") joinRoom(elements.codeInput.value);
});

elements.openCode.addEventListener("click", () => joinRoom(elements.codeInput.value));
elements.createRoom.addEventListener("click", createRoom);
elements.toggleReady.addEventListener("click", toggleReady);
elements.copyInvite.addEventListener("click", copyInvite);
elements.shareInvite.addEventListener("click", shareInvite);
elements.refreshActive.addEventListener("click", () => refreshActiveRoom());
elements.leaveRoom.addEventListener("click", leaveRoom);
elements.startGame.addEventListener("click", startGame);
elements.chatForm.addEventListener("submit", sendMessage);
elements.inviteLink.addEventListener("click", event => event.currentTarget.select());

elements.closePanel.addEventListener("click", () => {
  elements.activePanel.classList.add("hidden");
  document.querySelector(".arena-rooms-window")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

elements.refresh.addEventListener("click", async () => {
  setButtonBusy(elements.refresh, true, "ATUALIZANDO...");
  await refreshPublicRooms();
  await refreshActiveRoom();
  await renderInviteBanner();
  setButtonBusy(elements.refresh, false);
});

window.addEventListener("online", () => {
  setServerStatus("connecting", "RECONECTANDO...", "A internet voltou. Reconectando à Arena.");
  subscribeLobby();
  refreshPublicRooms({ silent: true });
  refreshActiveRoom({ silent: true });
});

window.addEventListener("offline", () => {
  setServerStatus("error", "SEM INTERNET", "As salas voltarão a sincronizar quando a conexão retornar.");
});

window.addEventListener("pagehide", () => {
  if (state.refreshTimer) window.clearInterval(state.refreshTimer);
});

initializeArena();
