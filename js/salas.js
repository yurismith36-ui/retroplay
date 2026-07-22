const ARENA_STORAGE_KEY = "retroplay-arena-rooms-v1";
const ARENA_NAME_KEY = "retroplay-arena-nickname";
const ARENA_ACTIVE_KEY = "retroplay-arena-active-room";
const ROOM_COUNT = 3;
const ROOM_MAX_AGE = 12 * 60 * 60 * 1000;

const playerSessionId = (() => {
  let id = sessionStorage.getItem("retroplay-arena-session-id");
  if (!id) {
    id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `sessao-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem("retroplay-arena-session-id", id);
  }
  return id;
})();

const arenaState = {
  games: [],
  rooms: [],
  activeRoomNumber: Number(sessionStorage.getItem(ARENA_ACTIVE_KEY) || 0),
  nickname: localStorage.getItem(ARENA_NAME_KEY) || "",
  channel: "BroadcastChannel" in window ? new BroadcastChannel("retroplay-arena-v1") : null
};

const arenaElements = {
  nickname: document.querySelector("#arena-nickname"),
  saveNickname: document.querySelector("#save-nickname"),
  codeInput: document.querySelector("#room-code-input"),
  openCode: document.querySelector("#open-room-code"),
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
  toggleReady: document.querySelector("#toggle-ready"),
  copyInvite: document.querySelector("#copy-invite"),
  simulatePlayerTwo: document.querySelector("#simulate-player-two"),
  leaveRoom: document.querySelector("#leave-room"),
  closePanel: document.querySelector("#close-room-panel"),
  startLocal: document.querySelector("#start-local-game"),
  inviteBanner: document.querySelector("#invite-banner")
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

function makeEmptyRoom(number) {
  return {
    number,
    code: "",
    gameId: "",
    host: null,
    guest: null,
    private: false,
    createdAt: 0,
    updatedAt: 0
  };
}

function normalizeRooms(rawRooms) {
  const now = Date.now();
  const source = Array.isArray(rawRooms) ? rawRooms : [];

  return Array.from({ length: ROOM_COUNT }, (_, index) => {
    const number = index + 1;
    const found = source.find(room => Number(room.number) === number);
    if (!found) return makeEmptyRoom(number);

    const expired = found.updatedAt && now - Number(found.updatedAt) > ROOM_MAX_AGE;
    if (expired) return makeEmptyRoom(number);

    return {
      ...makeEmptyRoom(number),
      ...found,
      number,
      host: found.host || null,
      guest: found.guest || null
    };
  });
}

function loadRooms() {
  try {
    arenaState.rooms = normalizeRooms(JSON.parse(localStorage.getItem(ARENA_STORAGE_KEY) || "[]"));
  } catch (error) {
    arenaState.rooms = normalizeRooms([]);
  }
}

function saveRooms() {
  const now = Date.now();
  arenaState.rooms = arenaState.rooms.map(room =>
    room.host ? { ...room, updatedAt: now } : room
  );
  localStorage.setItem(ARENA_STORAGE_KEY, JSON.stringify(arenaState.rooms));
  arenaState.channel?.postMessage({ type: "rooms-updated", at: now });
  renderArena();
}

function currentRoom() {
  return arenaState.rooms.find(room => room.number === arenaState.activeRoomNumber) || null;
}

function gameById(gameId) {
  return arenaState.games.find(game => game.id === gameId) || null;
}

function currentRole(room) {
  if (!room) return "";
  if (room.host?.sessionId === playerSessionId) return "host";
  if (room.guest?.sessionId === playerSessionId) return "guest";
  return "";
}

function roomStatus(room) {
  if (!room.host) return { key: "free", label: "LIVRE" };
  if (!room.guest) return { key: "waiting", label: "1/2 — AGUARDANDO" };
  if (room.host.ready && room.guest.ready) return { key: "ready", label: "2/2 — PRONTOS" };
  return { key: "occupied", label: "2/2 — PREPARANDO" };
}

function requireNickname() {
  const value = arenaElements.nickname.value.trim().slice(0, 18);
  if (!value) {
    arenaElements.nickname.focus();
    alert("Digite seu nome na Arena antes de criar ou entrar em uma sala.");
    return "";
  }
  arenaState.nickname = value;
  localStorage.setItem(ARENA_NAME_KEY, value);
  return value;
}

function generateCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 6 }, () =>
      alphabet[Math.floor(Math.random() * alphabet.length)]
    ).join("");
  } while (arenaState.rooms.some(room => room.code === code));
  return code;
}

function roomInviteUrl(room) {
  const game = gameById(room.gameId);
  const url = new URL("salas.html", window.location.href);
  url.searchParams.set("sala", String(room.number));
  url.searchParams.set("codigo", room.code);
  url.searchParams.set("jogo", room.gameId);
  url.searchParams.set("host", room.host?.name || "Jogador 1");
  if (game?.nome) url.searchParams.set("nomeJogo", game.nome);
  return url.toString();
}

function createRoom(number) {
  const nickname = requireNickname();
  if (!nickname) return;

  const select = document.querySelector(`[data-game-select="${number}"]`);
  const privacy = document.querySelector(`[data-private-room="${number}"]`);
  const gameId = select?.value || "";
  if (!gameId) {
    alert("Escolha um jogo para criar a sala.");
    return;
  }

  const roomIndex = arenaState.rooms.findIndex(room => room.number === number);
  if (roomIndex < 0 || arenaState.rooms[roomIndex].host) {
    alert("Essa sala já está ocupada. Atualize a página e escolha outra.");
    return;
  }

  arenaState.rooms[roomIndex] = {
    number,
    code: generateCode(),
    gameId,
    private: Boolean(privacy?.checked),
    host: {
      sessionId: playerSessionId,
      name: nickname,
      ready: false
    },
    guest: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  arenaState.activeRoomNumber = number;
  sessionStorage.setItem(ARENA_ACTIVE_KEY, String(number));
  saveRooms();
  setTimeout(() => arenaElements.activePanel.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
}

function joinRoom(number) {
  const nickname = requireNickname();
  if (!nickname) return;

  const room = arenaState.rooms.find(item => item.number === number);
  if (!room?.host) {
    alert("A sala ficou livre. Escolha um jogo e crie uma nova sala.");
    renderArena();
    return;
  }

  const role = currentRole(room);
  if (role) {
    openRoomPanel(number);
    return;
  }

  if (room.guest) {
    alert("A sala já possui dois jogadores.");
    return;
  }

  room.guest = {
    sessionId: playerSessionId,
    name: nickname,
    ready: false
  };

  arenaState.activeRoomNumber = number;
  sessionStorage.setItem(ARENA_ACTIVE_KEY, String(number));
  saveRooms();
  setTimeout(() => arenaElements.activePanel.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
}

function openRoomPanel(number) {
  arenaState.activeRoomNumber = number;
  sessionStorage.setItem(ARENA_ACTIVE_KEY, String(number));
  renderArena();
  setTimeout(() => arenaElements.activePanel.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
}

function toggleReady() {
  const room = currentRoom();
  const role = currentRole(room);
  if (!room || !role) {
    alert("Entre na sala antes de ficar pronto.");
    return;
  }

  room[role].ready = !room[role].ready;
  saveRooms();
}

function simulatePlayerTwo() {
  const room = currentRoom();
  if (!room || currentRole(room) !== "host") return;

  if (room.guest?.simulated) {
    room.guest = null;
  } else if (!room.guest) {
    room.guest = {
      sessionId: `simulado-${room.number}`,
      name: "Amigo (teste)",
      ready: false,
      simulated: true
    };
  } else {
    alert("A sala já possui um Jogador 2 real.");
    return;
  }

  saveRooms();
}

function leaveRoom() {
  const room = currentRoom();
  const role = currentRole(room);
  if (!room || !role) {
    arenaState.activeRoomNumber = 0;
    sessionStorage.removeItem(ARENA_ACTIVE_KEY);
    renderArena();
    return;
  }

  if (role === "host") {
    const confirmed = confirm("Encerrar esta sala para todos os jogadores?");
    if (!confirmed) return;
    const index = arenaState.rooms.findIndex(item => item.number === room.number);
    arenaState.rooms[index] = makeEmptyRoom(room.number);
  } else {
    room.guest = null;
  }

  arenaState.activeRoomNumber = 0;
  sessionStorage.removeItem(ARENA_ACTIVE_KEY);
  saveRooms();
}

async function copyInvite() {
  const room = currentRoom();
  if (!room?.host) return;

  // Copia somente o link para que ele possa ser colado
  // diretamente na barra de endereço, sem virar pesquisa no Google.
  const inviteLink = roomInviteUrl(room);

  try {
    await navigator.clipboard.writeText(inviteLink);
    const original = arenaElements.copyInvite.textContent;
    arenaElements.copyInvite.textContent = "LINK COPIADO!";
    setTimeout(() => arenaElements.copyInvite.textContent = original, 1600);
  } catch (error) {
    prompt("Copie somente este link:", inviteLink);
  }
}

function openRoomByCode() {
  const code = arenaElements.codeInput.value.trim().toUpperCase();
  arenaElements.codeInput.value = code;

  if (code.length !== 6) {
    alert("Digite o código de 6 caracteres.");
    return;
  }

  const room = arenaState.rooms.find(item => item.code === code && item.host);
  if (!room) {
    alert("Esse código não foi encontrado neste navegador. Na Fase 2, o servidor permitirá encontrar salas criadas em outros aparelhos.");
    return;
  }

  if (currentRole(room)) openRoomPanel(room.number);
  else joinRoom(room.number);
}

function startLocalGame() {
  const room = currentRoom();
  if (!room?.host || !room.guest || !room.host.ready || !room.guest.ready) return;

  const game = gameById(room.gameId);
  if (!game) {
    alert("O jogo da sala não foi encontrado no catálogo.");
    return;
  }

  const confirmed = confirm(
    "Este é um teste local da Fase 1. O jogo abrirá sem sincronizar os controles pela internet. Continuar?"
  );
  if (!confirmed) return;

  window.location.href = `player.html?id=${encodeURIComponent(game.id)}&arena=teste&sala=${room.number}`;
}

function renderRoomCard(room) {
  const game = gameById(room.gameId);
  const status = roomStatus(room);
  const role = currentRole(room);
  const full = Boolean(room.host && room.guest);
  const cover = game?.capa || placeholderCover(game?.nome || `Sala ${room.number}`);

  const freeContent = `
    <div class="room-create-form">
      <label>
        <span>ESCOLHA O JOGO</span>
        <select data-game-select="${room.number}">
          ${arenaState.games.map(item => `
            <option value="${escapeHtml(item.id)}"${/mortal kombat/i.test(item.nome) ? " selected" : ""}>
              ${escapeHtml(item.nome)} — ${escapeHtml(item.console)}
            </option>`).join("")}
        </select>
      </label>
      <label class="privacy-check">
        <input data-private-room="${room.number}" type="checkbox">
        <span>Sala privada por convite</span>
      </label>
      <button class="purple-button arena-button" data-create-room="${room.number}" type="button">
        CRIAR SALA
      </button>
    </div>`;

  const occupiedContent = `
    <div class="room-game-preview">
      <img src="${escapeHtml(cover)}"
           alt="Capa de ${escapeHtml(game?.nome || "jogo")}"
           onerror="this.onerror=null;this.src='${placeholderCover(game?.nome || "Jogo")}'">
      <div>
        <strong>${escapeHtml(game?.nome || "Jogo não encontrado")}</strong>
        <small>${escapeHtml(game?.console || "Console")} • ${escapeHtml(game?.ano || "Clássico")}</small>
        <span>👤 ${escapeHtml(room.host?.name || "Jogador 1")}</span>
        <span>🔑 ${escapeHtml(room.code)}</span>
      </div>
    </div>
    <div class="room-card-actions">
      ${role
        ? `<button class="purple-button arena-button" data-open-room="${room.number}" type="button">ABRIR SALA</button>`
        : `<button class="purple-button arena-button" data-join-room="${room.number}" type="button" ${full ? "disabled" : ""}>
             ${full ? "SALA CHEIA" : "ENTRAR"}
           </button>`}
    </div>`;

  return `
    <article class="arena-room-card ${status.key}">
      <header>
        <div>
          <small>SALA</small>
          <strong>${room.number}</strong>
        </div>
        <span class="room-status-pill ${status.key}">${status.label}</span>
      </header>
      <div class="room-card-body">
        ${room.host ? occupiedContent : freeContent}
      </div>
      <footer>
        <span>${room.private ? "🔒 PRIVADA" : "🌍 PÚBLICA"}</span>
        <span>${room.host ? (room.guest ? "2 JOGADORES" : "1 JOGADOR") : "0 JOGADORES"}</span>
      </footer>
    </article>`;
}

function bindRoomCardActions() {
  document.querySelectorAll("[data-create-room]").forEach(button => {
    button.addEventListener("click", () => createRoom(Number(button.dataset.createRoom)));
  });

  document.querySelectorAll("[data-join-room]").forEach(button => {
    button.addEventListener("click", () => joinRoom(Number(button.dataset.joinRoom)));
  });

  document.querySelectorAll("[data-open-room]").forEach(button => {
    button.addEventListener("click", () => openRoomPanel(Number(button.dataset.openRoom)));
  });
}

function renderActiveRoom() {
  const room = currentRoom();
  if (!room?.host) {
    arenaElements.activePanel.classList.add("hidden");
    return;
  }

  const game = gameById(room.gameId);
  const status = roomStatus(room);
  const role = currentRole(room);
  const bothReady = Boolean(room.host?.ready && room.guest?.ready);

  arenaElements.activePanel.classList.remove("hidden");
  arenaElements.activeHeading.textContent = `🎮 SALA ${room.number}`;
  arenaElements.activeStatus.textContent = status.label;
  arenaElements.activeStatus.className = `room-status-pill ${status.key}`;
  arenaElements.activeCode.textContent = room.code;
  arenaElements.activeGameName.textContent = game?.nome || "Jogo não encontrado";
  arenaElements.activeGameMeta.textContent = `${game?.console || "Console"} • ${game?.ano || "Clássico"}`;
  arenaElements.activeCover.src = game?.capa || placeholderCover(game?.nome || "Jogo");
  arenaElements.activeCover.onerror = () => {
    arenaElements.activeCover.onerror = null;
    arenaElements.activeCover.src = placeholderCover(game?.nome || "Jogo");
  };

  arenaElements.hostName.textContent = room.host?.name || "Aguardando...";
  arenaElements.guestName.textContent = room.guest?.name || "Aguardando amigo...";
  arenaElements.hostReady.textContent = room.host?.ready ? "✓ PRONTO" : "NÃO PRONTO";
  arenaElements.guestReady.textContent = room.guest
    ? (room.guest.ready ? "✓ PRONTO" : "NÃO PRONTO")
    : "SEM JOGADOR";

  arenaElements.hostSlot.classList.toggle("ready", Boolean(room.host?.ready));
  arenaElements.guestSlot.classList.toggle("ready", Boolean(room.guest?.ready));

  if (role) {
    arenaElements.toggleReady.hidden = false;
    arenaElements.toggleReady.textContent = room[role].ready ? "CANCELAR PRONTO" : "FICAR PRONTO";
    arenaElements.leaveRoom.hidden = false;
  } else {
    arenaElements.toggleReady.hidden = true;
    arenaElements.leaveRoom.hidden = true;
  }

  arenaElements.copyInvite.hidden = !role;
  arenaElements.simulatePlayerTwo.hidden = role !== "host" || Boolean(room.guest && !room.guest.simulated);
  arenaElements.simulatePlayerTwo.textContent = room.guest?.simulated
    ? "REMOVER JOGADOR DE TESTE"
    : "SIMULAR JOGADOR 2";

  arenaElements.startLocal.disabled = !bothReady || !role;
  arenaElements.startLocal.textContent = bothReady
    ? "ABRIR JOGO LOCAL"
    : "AGUARDANDO OS 2 PRONTOS";
}

function renderInviteBanner() {
  const params = new URLSearchParams(location.search);
  const roomNumber = Number(params.get("sala") || 0);
  const code = (params.get("codigo") || "").toUpperCase();
  const host = params.get("host") || "Jogador 1";
  const gameName = params.get("nomeJogo") || "jogo escolhido";

  if (!roomNumber || !code) {
    arenaElements.inviteBanner.classList.add("hidden");
    return;
  }

  const localRoom = arenaState.rooms.find(room => room.number === roomNumber && room.code === code && room.host);

  if (localRoom) {
    arenaElements.inviteBanner.classList.remove("hidden");
    arenaElements.inviteBanner.innerHTML = `
      <div>
        <strong>🎟 CONVITE ENCONTRADO</strong>
        <span>${escapeHtml(host)} convidou você para jogar ${escapeHtml(gameName)} na Sala ${roomNumber}.</span>
      </div>
      <button id="accept-invite" class="purple-button arena-button" type="button">
        ${currentRole(localRoom) ? "ABRIR SALA" : "ACEITAR CONVITE"}
      </button>`;
    document.querySelector("#accept-invite")?.addEventListener("click", () => {
      if (currentRole(localRoom)) openRoomPanel(roomNumber);
      else joinRoom(roomNumber);
    });
  } else {
    arenaElements.inviteBanner.classList.remove("hidden");
    arenaElements.inviteBanner.innerHTML = `
      <div>
        <strong>🎟 LINK DE CONVITE RECONHECIDO</strong>
        <span>Convite de ${escapeHtml(host)} para ${escapeHtml(gameName)}, Sala ${roomNumber}, código ${escapeHtml(code)}.</span>
        <small>Este link foi aberto em outro aparelho ou navegador. A Fase 2 conectará essa sala pela internet.</small>
      </div>`;
  }
}

function renderArena() {
  const occupied = arenaState.rooms.filter(room => room.host).length;
  arenaElements.roomSummary.textContent = `${occupied}/${ROOM_COUNT} OCUPADAS`;
  arenaElements.rooms.innerHTML = arenaState.rooms.map(renderRoomCard).join("");
  bindRoomCardActions();
  renderActiveRoom();
  renderInviteBanner();
}

async function loadCatalog() {
  try {
    const response = await fetch("./dados/games.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("Catálogo inválido.");
    arenaState.games = data;
    loadRooms();
    renderArena();
  } catch (error) {
    console.error(error);
    arenaElements.rooms.innerHTML = `
      <div class="notice">
        <strong>Não foi possível carregar os jogos.</strong><br>
        Verifique o arquivo <code>dados/games.json</code>.
      </div>`;
  }
}

arenaElements.nickname.value = arenaState.nickname;

arenaElements.saveNickname.addEventListener("click", () => {
  const name = requireNickname();
  if (!name) return;
  arenaElements.saveNickname.textContent = "NOME SALVO!";
  setTimeout(() => arenaElements.saveNickname.textContent = "SALVAR NOME", 1300);
});

arenaElements.nickname.addEventListener("keydown", event => {
  if (event.key === "Enter") arenaElements.saveNickname.click();
});

arenaElements.openCode.addEventListener("click", openRoomByCode);
arenaElements.codeInput.addEventListener("input", () => {
  arenaElements.codeInput.value = arenaElements.codeInput.value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
});
arenaElements.codeInput.addEventListener("keydown", event => {
  if (event.key === "Enter") openRoomByCode();
});

arenaElements.toggleReady.addEventListener("click", toggleReady);
arenaElements.copyInvite.addEventListener("click", copyInvite);
arenaElements.simulatePlayerTwo.addEventListener("click", simulatePlayerTwo);
arenaElements.leaveRoom.addEventListener("click", leaveRoom);
arenaElements.closePanel.addEventListener("click", () => {
  arenaState.activeRoomNumber = 0;
  sessionStorage.removeItem(ARENA_ACTIVE_KEY);
  renderArena();
});
arenaElements.startLocal.addEventListener("click", startLocalGame);
document.querySelector("#arena-refresh").addEventListener("click", () => location.reload());

window.addEventListener("storage", event => {
  if (event.key === ARENA_STORAGE_KEY) {
    loadRooms();
    renderArena();
  }
});

arenaState.channel?.addEventListener("message", event => {
  if (event.data?.type === "rooms-updated") {
    loadRooms();
    renderArena();
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    loadRooms();
    renderArena();
  }
});

loadCatalog();
