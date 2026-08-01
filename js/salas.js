// RetroPlay Arena 2.0 — lobby real no Supabase + lançamento do netplay beta.
(() => {
  "use strict";

  const client = window.retroplaySupabase;
  const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
  const HEARTBEAT_MS = 20000;
  const ONLINE_WINDOW_MS = 50000;

  const state = {
    user: null,
    games: [],
    rooms: [],
    players: [],
    activeCode: sessionStorage.getItem("retroplay-arena-active-code") || "",
    activeRoom: null,
    activePlayers: [],
    realtime: null,
    reloadTimer: null,
    heartbeatTimer: null,
    navigating: false,
    lastInvite: localStorage.getItem("retroplay-arena-last-invite") || "",
    inviteCode: new URLSearchParams(location.search).get("codigo")?.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6) || "",
    inviteAttempted: false
  };

  const el = {
    loginBox: document.querySelector("#arena-login-box"),
    createForm: document.querySelector("#arena-create-form"),
    name: document.querySelector("#arena-name"),
    game: document.querySelector("#arena-game"),
    privateRoom: document.querySelector("#arena-private"),
    modeNote: document.querySelector("#arena-mode-note"),
    joinName: document.querySelector("#arena-join-name"),
    code: document.querySelector("#arena-code"),
    joinCode: document.querySelector("#arena-join-code"),
    copyLast: document.querySelector("#arena-copy-last"),
    refresh: document.querySelector("#arena-refresh"),
    roomList: document.querySelector("#arena-room-list"),
    roomTotal: document.querySelector("#arena-room-total"),
    active: document.querySelector("#arena-active"),
    activeTitle: document.querySelector("#arena-active-title"),
    activeStatus: document.querySelector("#arena-active-status"),
    activeCover: document.querySelector("#arena-active-cover"),
    activeMode: document.querySelector("#arena-active-mode"),
    activeGame: document.querySelector("#arena-active-game"),
    activeMeta: document.querySelector("#arena-active-meta"),
    activeCode: document.querySelector("#arena-active-code"),
    playerGrid: document.querySelector("#arena-player-grid"),
    ready: document.querySelector("#arena-ready"),
    copy: document.querySelector("#arena-copy"),
    start: document.querySelector("#arena-start"),
    leave: document.querySelector("#arena-leave"),
    feedback: document.querySelector("#arena-feedback"),
    inviteEntry: document.querySelector("#arena-invite-entry"),
    inviteTitle: document.querySelector("#arena-invite-title"),
    inviteMessage: document.querySelector("#arena-invite-message"),
    inviteLogin: document.querySelector("#arena-invite-login")
  };

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

  function setFeedback(message = "", type = "") {
    el.feedback.textContent = message;
    el.feedback.className = `arena-feedback${type ? ` ${type}` : ""}`;
  }

  function errorMessage(error) {
    const raw = String(error?.message || error || "");
    if (raw.includes("LOGIN_REQUIRED")) return "Entre na sua conta antes de usar a Arena.";
    if (raw.includes("ROOM_NOT_FOUND")) return "Sala não encontrada. Confira o código.";
    if (raw.includes("ROOM_FULL")) return "A sala já está cheia.";
    if (raw.includes("ROOM_NOT_JOINABLE")) return "A partida já começou ou a sala foi encerrada.";
    if (raw.includes("ROOM_CODE_IN_USE")) return "O código foi usado por outra sala. Tente novamente.";
    if (raw.includes("PLAYERS_NOT_READY")) return "Todos os lugares precisam estar ocupados e prontos.";
    if (raw.includes("HOST_ONLY")) return "Somente o dono da sala pode iniciar.";
    if (raw.includes("ACTIVE_MATCH")) return "Você ainda está em uma partida ativa. Saia dela ou aguarde alguns minutos para a sala expirar.";
    if (/arena_rooms|arena_players|function public\.arena_/i.test(raw)) {
      return "A Arena ainda não foi ativada no Supabase. Execute o arquivo SUPABASE-ARENA-2.0.sql.";
    }
    return raw || "Não foi possível concluir a ação.";
  }

  function gameById(id) {
    return state.games.find(game => String(game.id) === String(id)) || null;
  }

  function roomPlayers(code) {
    return state.players
      .filter(player => player.room_code === code)
      .sort((a, b) => Number(a.slot) - Number(b.slot));
  }

  function activePlayer() {
    return state.activePlayers.find(player => player.user_id === state.user?.id) || null;
  }

  function isHost(room = state.activeRoom) {
    return Boolean(room && state.user && room.host_user_id === state.user.id);
  }

  function modeInfo(mode) {
    return mode === "multitap4"
      ? { label: "SNES MULTITAP — 4 JOGADORES", max: 4 }
      : { label: "DUELO 1 × 1", max: 2 };
  }

  function statusLabel(room) {
    if (room.status === "playing") return "PARTIDA INICIADA";
    if (room.status === "ready") return "TODOS PRONTOS";
    const count = roomPlayers(room.code).length;
    return `${count}/${room.max_players} — AGUARDANDO`;
  }

  function inviteUrl(code) {
    const url = new URL("salas.html", location.href);
    url.searchParams.set("codigo", code);
    return url.toString();
  }

  function generateCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  }

  function fillNames() {
    if (!state.user) return;
    // Migração única: remove o apelido antigo que parecia nome de sala (ex.: “BRIGA DE RUGAL”).
    if (!localStorage.getItem("retroplay-arena-nickname-reset-20260801")) {
      localStorage.removeItem("retroplay-arena-nickname-v2");
      localStorage.setItem("retroplay-arena-nickname-reset-20260801", "1");
    }
    const saved = localStorage.getItem("retroplay-arena-nickname-v2") || displayName(state.user);
    if (!el.name.value) el.name.value = saved;
    if (!el.joinName.value) el.joinName.value = saved;
  }

  function saveName(value) {
    const clean = String(value || "").trim().slice(0, 40);
    if (clean) localStorage.setItem("retroplay-arena-nickname-v2", clean);
    return clean;
  }

  function selectedMode() {
    return document.querySelector('input[name="arena-mode"]:checked')?.value || "duelo";
  }

  function populateGames() {
    const mode = selectedMode();
    const current = el.game.value;
    const games = mode === "multitap4"
      ? state.games.filter(game => String(game.console || "").toUpperCase() === "SNES")
      : state.games;

    el.game.innerHTML = `<option value="">Escolha o jogo</option>${games.map(game => {
      const suffix = mode === "multitap4" ? " — verifique compatibilidade Multitap" : "";
      return `<option value="${escapeHtml(game.id)}">${escapeHtml(game.nome)} — ${escapeHtml(game.console)}${suffix}</option>`;
    }).join("")}`;

    if (games.some(game => game.id === current)) el.game.value = current;
    else {
      const preferred = games.find(game => /mortal kombat/i.test(game.nome)) || games[0];
      if (preferred) el.game.value = preferred.id;
    }

    el.modeNote.innerHTML = mode === "multitap4"
      ? "<strong>Até 4 jogadores:</strong> o lobby aceita P1, P2, P3 e P4. O jogo escolhido precisa oferecer suporte ao acessório SNES Multitap; caso contrário, ele reconhecerá somente os controles permitidos pelo próprio jogo."
      : "<strong>Duelo:</strong> exige 2 jogadores ocupando P1 e P2 e marcados como prontos.";
  }

  async function loadCatalog() {
    const response = await fetch("./dados/games.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Catálogo indisponível (${response.status}).`);
    const data = await response.json();
    state.games = Array.isArray(data) ? data : [];
    populateGames();
  }

  async function loadArena() {
    if (!client || !state.user) {
      state.rooms = [];
      state.players = [];
      render();
      return;
    }

    const cutoff = new Date(Date.now() - ROOM_TTL_MS).toISOString();
    try {
      await client.rpc("arena_cleanup_stale");
    } catch (_error) {
      // A limpeza também ocorre ao criar/entrar. Ignora falha de rede momentânea.
    }

    const [roomsResult, playersResult] = await Promise.all([
      client.from("arena_rooms")
        .select("code,host_user_id,game_id,game_name,game_core,mode,max_players,is_private,status,created_at,updated_at,started_at")
        .neq("status", "closed")
        .gte("updated_at", cutoff)
        .order("updated_at", { ascending: false }),
      client.from("arena_players")
        .select("room_code,user_id,display_name,slot,ready,joined_at,last_seen")
        .order("slot", { ascending: true })
    ]);

    if (roomsResult.error) throw roomsResult.error;
    if (playersResult.error) throw playersResult.error;

    state.rooms = roomsResult.data || [];
    const visibleCodes = new Set(state.rooms.map(room => room.code));
    state.players = (playersResult.data || []).filter(player => visibleCodes.has(player.room_code));
    state.activeRoom = state.rooms.find(room => room.code === state.activeCode) || null;
    state.activePlayers = state.activeRoom ? roomPlayers(state.activeRoom.code) : [];

    if (state.activeCode && !state.activeRoom) {
      state.activeCode = "";
      sessionStorage.removeItem("retroplay-arena-active-code");
      setFeedback("A sala foi encerrada.", "error");
    }

    render();
    maybeOpenPlayer();
  }

  function scheduleLoad() {
    clearTimeout(state.reloadTimer);
    state.reloadTimer = setTimeout(() => loadArena().catch(handleError), 220);
  }

  function handleError(error) {
    console.error("Arena:", error);
    setFeedback(errorMessage(error), "error");
    if (!state.rooms.length) {
      el.roomList.innerHTML = `<div class="arena-empty">${escapeHtml(errorMessage(error))}</div>`;
    }
  }

  function renderRooms() {
    const visible = state.rooms.filter(room => !room.is_private || room.host_user_id === state.user?.id || roomPlayers(room.code).some(p => p.user_id === state.user?.id));
    el.roomTotal.textContent = `${visible.length} ${visible.length === 1 ? "SALA" : "SALAS"}`;

    if (!state.user) {
      el.roomList.innerHTML = '<div class="arena-empty">Entre na sua conta para visualizar e criar salas online.</div>';
      return;
    }

    if (!visible.length) {
      el.roomList.innerHTML = '<div class="arena-empty">Nenhuma sala pública disponível. Crie a primeira ou entre por código.</div>';
      return;
    }

    el.roomList.innerHTML = visible.map(room => {
      const players = roomPlayers(room.code);
      const game = gameById(room.game_id);
      const joined = players.some(player => player.user_id === state.user?.id);
      const full = players.length >= room.max_players;
      return `<article class="arena-v2-room">
        <header><strong>${escapeHtml(room.code)}</strong><span class="room-status-pill ${room.status === "ready" ? "ready" : "waiting"}">${escapeHtml(statusLabel(room))}</span></header>
        <div class="room-game">
          <img src="${escapeHtml(game?.capa || "assets/icone-controle.svg")}" alt="Capa de ${escapeHtml(room.game_name)}">
          <div><h3>${escapeHtml(room.game_name)}</h3><p>${escapeHtml(modeInfo(room.mode).label)}<br>Dono: ${escapeHtml(players[0]?.display_name || "Jogador")}</p></div>
        </div>
        <footer><span>${room.is_private ? "🔒 PRIVADA" : "🌍 PÚBLICA"}</span><span>${players.length}/${room.max_players} JOGADORES</span></footer>
        <button class="purple-button arena-button" type="button" data-room-action="${joined ? "open" : "join"}" data-room-code="${escapeHtml(room.code)}" ${!joined && full ? "disabled" : ""}>${joined ? "ABRIR SALA" : (full ? "SALA CHEIA" : "ENTRAR")}</button>
      </article>`;
    }).join("");

    el.roomList.querySelectorAll("[data-room-action]").forEach(button => {
      button.addEventListener("click", () => {
        const code = button.dataset.roomCode;
        if (button.dataset.roomAction === "open") openRoom(code);
        else joinRoom(code);
      });
    });
  }

  function renderActive() {
    const room = state.activeRoom;
    const me = activePlayer();
    if (!room || !me) {
      el.active.classList.add("arena-hidden");
      stopHeartbeat();
      return;
    }

    el.active.classList.remove("arena-hidden");
    el.activeTitle.textContent = isHost(room) ? "👑 SUA SALA — VOCÊ É O DONO" : "🎮 SALA ONLINE";
    el.activeStatus.textContent = statusLabel(room);
    const game = gameById(room.game_id);
    el.activeCover.src = game?.capa || "assets/icone-controle.svg";
    el.activeGame.textContent = room.game_name;
    el.activeMeta.textContent = `${game?.console || room.game_core} • ${room.max_players} jogadores`;
    el.activeMode.textContent = modeInfo(room.mode).label;
    el.activeCode.textContent = room.code;

    el.playerGrid.innerHTML = Array.from({ length: room.max_players }, (_, index) => {
      const slot = index + 1;
      const player = state.activePlayers.find(item => Number(item.slot) === slot);
      const online = player && Date.now() - new Date(player.last_seen).getTime() < ONLINE_WINDOW_MS;
      return `<article class="arena-player-v2 ${player?.ready ? "ready" : ""} ${player?.user_id === state.user.id ? "me" : ""} ${player ? "" : "empty"}">
        <span class="slot">JOGADOR ${slot}</span>
        <strong>${escapeHtml(player?.display_name || "Vaga livre")}</strong>
        <small>${player ? `${online ? "● ONLINE" : "● RECONECTANDO"} • ${player.ready ? "PRONTO" : "NÃO PRONTO"}` : "AGUARDANDO"}</small>
      </article>`;
    }).join("");

    el.ready.textContent = me.ready ? "CANCELAR PRONTO" : "FICAR PRONTO";
    const allReady = state.activePlayers.length === room.max_players && state.activePlayers.every(player => player.ready);
    el.start.disabled = !isHost(room) || !allReady || room.status === "playing";
    el.start.textContent = room.status === "playing" ? "ABRINDO PARTIDA..." : "INICIAR PARTIDA";
    startHeartbeat();
  }


  function configureInviteEntry() {
    if (!state.inviteCode || !el.inviteEntry) return;
    document.body.classList.add("arena-invite-mode");
    el.inviteEntry.classList.remove("arena-hidden");
    el.inviteTitle.textContent = `Convite para a sala ${state.inviteCode}`;

    const returnPath = `${location.pathname.split("/").pop() || "salas.html"}?codigo=${encodeURIComponent(state.inviteCode)}`;
    el.inviteLogin.href = `login.html?voltar=${encodeURIComponent(returnPath)}`;

    if (!state.user) {
      el.inviteMessage.textContent = "Entre na sua conta. Depois do login você voltará diretamente para esta sala.";
      el.inviteLogin.classList.remove("arena-hidden");
      return;
    }

    el.inviteLogin.classList.add("arena-hidden");
    if (state.activeCode === state.inviteCode && state.activeRoom) {
      el.inviteTitle.textContent = state.activeRoom.game_name || `Sala ${state.inviteCode}`;
      el.inviteMessage.textContent = "Você já está no lobby. Toque em FICAR PRONTO para confirmar sua participação.";
      return;
    }

    el.inviteMessage.textContent = "Entrando automaticamente no lobby...";
  }

  async function acceptInviteAutomatically() {
    configureInviteEntry();
    if (!state.inviteCode || !state.user || state.inviteAttempted) return;
    if (state.activeCode === state.inviteCode && state.activeRoom) return;
    state.inviteAttempted = true;
    try {
      await joinRoom(state.inviteCode);
      el.inviteTitle.textContent = state.activeRoom?.game_name || `Sala ${state.inviteCode}`;
      el.inviteMessage.textContent = "Convite aceito! Agora toque em FICAR PRONTO.";
      history.replaceState({}, "", "salas.html");
    } catch (error) {
      state.inviteAttempted = false;
      el.inviteMessage.textContent = errorMessage(error);
      throw error;
    }
  }

  function render() {
    const logged = Boolean(state.user);
    el.loginBox.classList.toggle("arena-hidden", logged);
    el.createForm.querySelectorAll("input,select,button").forEach(node => { node.disabled = !logged; });
    el.joinName.disabled = !logged;
    el.code.disabled = !logged;
    el.joinCode.disabled = !logged;
    el.copyLast.disabled = !state.lastInvite;
    fillNames();
    renderRooms();
    renderActive();
    configureInviteEntry();
  }

  async function createRoom(event) {
    event.preventDefault();
    if (!state.user) return setFeedback("Entre na sua conta.", "error");
    const name = saveName(el.name.value);
    const game = gameById(el.game.value);
    const mode = selectedMode();
    const max = modeInfo(mode).max;
    if (!name) return setFeedback("Digite seu nome na Arena.", "error");
    if (!game) return setFeedback("Escolha um jogo.", "error");
    if (mode === "multitap4" && String(game.console).toUpperCase() !== "SNES") {
      return setFeedback("O modo de quatro jogadores está liberado somente para jogos de SNES.", "error");
    }

    setFeedback("Criando sala online...");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateCode();
      const { error } = await client.rpc("arena_create_room", {
        p_code: code,
        p_game_id: game.id,
        p_game_name: game.nome,
        p_game_core: game.core,
        p_mode: mode,
        p_max_players: max,
        p_is_private: el.privateRoom.checked,
        p_display_name: name
      });
      if (!error) {
        openRoom(code);
        const invite = inviteUrl(code);
        state.lastInvite = invite;
        localStorage.setItem("retroplay-arena-last-invite", invite);
        setFeedback("Sala criada. Envie o convite aos jogadores.", "ok");
        await loadArena();
        el.active.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (!String(error.message).includes("ROOM_CODE_IN_USE")) throw error;
    }
    throw new Error("Não foi possível gerar um código livre.");
  }

  async function joinRoom(codeValue = el.code.value) {
    if (!state.user) return setFeedback("Entre na sua conta.", "error");
    const code = String(codeValue || "").trim().toUpperCase();
    const name = saveName(el.joinName.value || el.name.value || displayName(state.user));
    if (code.length !== 6) return setFeedback("Digite o código de 6 caracteres.", "error");
    if (!name) return setFeedback("Digite seu nome na Arena.", "error");

    setFeedback("Entrando na sala...");
    const { error } = await client.rpc("arena_join_room", { p_code: code, p_display_name: name });
    if (error) throw error;
    openRoom(code);
    setFeedback("Você entrou na sala.", "ok");
    await loadArena();
    el.active.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openRoom(code) {
    state.activeCode = String(code || "").toUpperCase();
    sessionStorage.setItem("retroplay-arena-active-code", state.activeCode);
    state.activeRoom = state.rooms.find(room => room.code === state.activeCode) || null;
    state.activePlayers = state.activeRoom ? roomPlayers(state.activeCode) : [];
    renderActive();
  }

  async function toggleReady() {
    const me = activePlayer();
    if (!state.activeCode || !me) return;
    const { error } = await client.rpc("arena_set_ready", { p_code: state.activeCode, p_ready: !me.ready });
    if (error) throw error;
    setFeedback(!me.ready ? "Você está pronto." : "Status de pronto cancelado.", "ok");
    await loadArena();
  }

  async function startRoom() {
    if (!state.activeCode || !isHost()) return;
    el.start.disabled = true;
    setFeedback("Iniciando para todos os jogadores...");
    const { error } = await client.rpc("arena_start_room", { p_code: state.activeCode });
    if (error) throw error;
    await loadArena();
  }

  async function leaveRoom() {
    if (!state.activeCode) return;
    const message = isHost() ? "Encerrar a sala para todos?" : "Sair desta sala?";
    if (!confirm(message)) return;
    const code = state.activeCode;
    state.activeCode = "";
    sessionStorage.removeItem("retroplay-arena-active-code");
    stopHeartbeat();
    const { error } = await client.rpc("arena_leave_room", { p_code: code });
    if (error) throw error;
    setFeedback("Você saiu da sala.", "ok");
    await loadArena();
  }

  async function copyText(text, success = "Convite copiado!") {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_error) {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setFeedback(success, "ok");
  }

  async function copyActiveInvite() {
    if (!state.activeCode) return;
    const invite = inviteUrl(state.activeCode);
    state.lastInvite = invite;
    localStorage.setItem("retroplay-arena-last-invite", invite);
    el.copyLast.disabled = false;
    const roomName = state.activeRoom?.game_name || "um jogo";
    const shareData = {
      title: "Convite RetroPlay Arena",
      text: `🎮 Bora jogar ${roomName} no RetroPlay? Abra o convite, entre na sua conta e toque em PRONTO.`,
      url: invite
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setFeedback("Convite compartilhado!", "ok");
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    await copyText(`${shareData.text}\n\n${invite}`, "Convite copiado!");
  }

  function maybeOpenPlayer() {
    const room = state.activeRoom;
    const me = activePlayer();
    if (!room || !me || room.status !== "playing" || state.navigating) return;
    state.navigating = true;
    const params = new URLSearchParams({
      id: room.game_id,
      sala: room.code,
      slot: String(me.slot),
      modo: room.mode,
      jogadores: String(room.max_players),
      host: isHost(room) ? "1" : "0"
    });
    location.assign(`arena-player.html?${params}`);
  }

  function startHeartbeat() {
    if (state.heartbeatTimer || !state.activeCode) return;
    const beat = async () => {
      try {
        await client.rpc("arena_heartbeat", { p_code: state.activeCode });
      } catch (_error) {
        // Mantém a página funcionando durante uma queda rápida de conexão.
      }
    };
    beat();
    state.heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
  }

  function stopHeartbeat() {
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = null;
  }

  function setupRealtime() {
    if (!client || state.realtime) return;
    state.realtime = client
      .channel("retroplay-arena-v2-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "arena_rooms" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "arena_players" }, scheduleLoad)
      .subscribe();
  }

  function bind() {
    el.createForm.addEventListener("submit", event => createRoom(event).catch(handleError));
    el.joinCode.addEventListener("click", () => joinRoom().catch(handleError));
    el.code.addEventListener("keydown", event => {
      if (event.key === "Enter") joinRoom().catch(handleError);
    });
    el.code.addEventListener("input", () => { el.code.value = el.code.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6); });
    document.querySelectorAll('input[name="arena-mode"]').forEach(input => input.addEventListener("change", populateGames));
    el.ready.addEventListener("click", () => toggleReady().catch(handleError));
    el.start.addEventListener("click", () => startRoom().catch(handleError));
    el.leave.addEventListener("click", () => leaveRoom().catch(handleError));
    el.copy.addEventListener("click", copyActiveInvite);
    el.copyLast.addEventListener("click", () => state.lastInvite && copyText(state.lastInvite));
    el.refresh.addEventListener("click", () => loadArena().catch(handleError));
    window.addEventListener("pagehide", stopHeartbeat);
  }

  async function initialize() {
    bind();
    const inviteCode = state.inviteCode;
    if (inviteCode) el.code.value = inviteCode;
    configureInviteEntry();
    await loadCatalog();
    setupRealtime();

    if (window.RetroPlayAuth?.onChange) {
      window.RetroPlayAuth.onChange(user => {
        state.user = user;
        fillNames();
        loadArena().then(acceptInviteAutomatically).catch(handleError);
      });
    } else {
      const { data } = await client.auth.getSession();
      state.user = data?.session?.user || null;
      await loadArena();
      await acceptInviteAutomatically();
    }
  }

  initialize().catch(handleError);
})();
