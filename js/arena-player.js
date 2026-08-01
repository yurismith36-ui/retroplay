// Naya Engine 0.4.2 — transmissão automática + Controle 2 remoto.
(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  const gameId = params.get("id") || "";
  const roomCode = (params.get("sala") || "").toUpperCase();
  const slot = Number(params.get("slot") || 0);
  const isHost = params.get("host") === "1";
  const config = window.RETROPLAY_ARENA_CONFIG || {};
  const client = window.retroplaySupabase;

  const el = {
    title: document.querySelector("#arena-player-title"),
    meta: document.querySelector("#arena-player-meta"),
    loading: document.querySelector("#arena-player-loading"),
    loadingTitle: document.querySelector("#arena-loading-title"),
    loadingMessage: document.querySelector("#arena-loading-message"),
    serverDot: document.querySelector("#arena-server-dot"),
    exit: document.querySelector("#arena-exit"),
    role: document.querySelector("#naya-role"),
    remoteVideo: document.querySelector("#naya-remote-video"),
    status: document.querySelector("#naya-status"),
    game: document.querySelector("#game"),
    transmitButton: document.querySelector("#naya-start-transmission"),
    retryButton: document.querySelector("#naya-retry"),
    remoteControls: document.querySelector("#naya-remote-controls"),
    controlsState: document.querySelector("#naya-controls-state"),
    controlButtons: [...document.querySelectorAll("[data-naya-button]")]
  };

  let user = null;
  let game = null;
  let channel = null;
  let peer = null;
  let loaderScript = null;
  let localStream = null;
  let heartbeatTimer = null;
  let guestAnnounceTimer = null;
  let gameReadyTimer = null;
  let guestWaiting = false;
  let offerInProgress = false;
  let emulatorStarted = false;
  let remoteDescriptionReady = false;
  let controlChannel = null;
  let controlHeartbeatTimer = null;
  let transmissionInProgress = false;
  let remoteVideoReceived = false;
  let exitInProgress = false;
  let roomClosedRedirecting = false;
  const queuedCandidates = [];
  const guestPressedButtons = new Set();
  const hostRemoteButtons = new Set();
  const REMOTE_PLAYER_INDEX = 1;
  const REMOTE_BUTTON_COUNT = 12;

  function setMessage(title, message, type = "") {
    if (el.loadingTitle) el.loadingTitle.textContent = title;
    if (el.loadingMessage) el.loadingMessage.textContent = message;
    if (el.serverDot) {
      el.serverDot.className = `arena-online-dot${type === "error" ? " error" : type === "ok" ? " ok" : ""}`;
    }
    if (el.status) el.status.textContent = `${title} — ${message}`;
  }

  function showLoading(show) {
    el.loading?.classList.toggle("hidden", !show);
  }

  function showTransmitButton(show, text = "INICIAR TRANSMISSÃO") {
    if (!el.transmitButton) return;
    el.transmitButton.hidden = !show;
    el.transmitButton.disabled = false;
    el.transmitButton.textContent = text;
  }

  function showRetry(show, text = "TENTAR NOVAMENTE") {
    if (!el.retryButton) return;
    el.retryButton.hidden = !show;
    el.retryButton.textContent = text;
  }


  function setControlsState(message, enabled = false) {
    if (el.controlsState) el.controlsState.textContent = message;
    el.controlButtons.forEach(button => {
      button.disabled = !enabled;
    });
    el.remoteControls?.classList.toggle("is-ready", enabled);
  }

  function showRemoteControls(show) {
    if (!el.remoteControls) return;
    el.remoteControls.hidden = !show;
  }

  function focusEmulatorCanvas() {
    const canvas = findEmulatorCanvas();
    if (!canvas) return null;
    if (!canvas.hasAttribute("tabindex")) canvas.tabIndex = -1;
    try { canvas.focus({ preventScroll: true }); } catch (_error) { try { canvas.focus(); } catch (_ignored) {} }
    return canvas;
  }

  function applyRemoteButton(button, pressed) {
    const manager = window.EJS_emulator?.gameManager;
    if (!manager || typeof manager.simulateInput !== "function") {
      throw new Error("O Controle 2 ainda não está disponível no emulador do host.");
    }
    focusEmulatorCanvas();
    manager.simulateInput(REMOTE_PLAYER_INDEX, Number(button), pressed ? 1 : 0);
  }

  function releaseHostRemoteButtons() {
    if (!isHost || !hostRemoteButtons.size) return;
    for (const button of [...hostRemoteButtons]) {
      try { applyRemoteButton(button, false); } catch (_error) {}
    }
    hostRemoteButtons.clear();
  }

  function applyRemoteControlState(buttons) {
    if (!isHost || !emulatorStarted) return;
    const next = new Set(
      Array.isArray(buttons)
        ? buttons.map(Number).filter(button => Number.isInteger(button) && button >= 0 && button < REMOTE_BUTTON_COUNT)
        : []
    );

    for (let button = 0; button < REMOTE_BUTTON_COUNT; button += 1) {
      const wasPressed = hostRemoteButtons.has(button);
      const isPressed = next.has(button);
      if (wasPressed === isPressed) continue;
      applyRemoteButton(button, isPressed);
    }

    hostRemoteButtons.clear();
    next.forEach(button => hostRemoteButtons.add(button));
  }

  function sendControlState() {
    if (isHost || !controlChannel || controlChannel.readyState !== "open") return;
    try {
      controlChannel.send(JSON.stringify({
        type: "controls",
        buttons: [...guestPressedButtons],
        at: performance.now()
      }));
    } catch (_error) {}
  }

  function releaseGuestControls() {
    if (isHost) return;
    guestPressedButtons.clear();
    el.controlButtons.forEach(button => button.classList.remove("is-pressed"));
    sendControlState();
  }

  function updateGuestControlAvailability() {
    if (isHost) return;
    showRemoteControls(true);
    const channelReady = controlChannel?.readyState === "open";
    if (channelReady && remoteVideoReceived) {
      setControlsState("CONTROLE 2 CONECTADO", true);
    } else if (channelReady) {
      setControlsState("Controle 2 conectado — aguardando imagem...", true);
    } else {
      setControlsState("Conectando Controle 2...", false);
    }
  }

  function bindControlChannel(nextChannel) {
    if (!nextChannel) return;
    controlChannel = nextChannel;
    controlChannel.binaryType = "arraybuffer";

    controlChannel.addEventListener("open", () => {
      if (!isHost) {
        updateGuestControlAvailability();
        sendControlState();
        clearInterval(controlHeartbeatTimer);
        controlHeartbeatTimer = setInterval(sendControlState, 150);
      }
    });

    controlChannel.addEventListener("message", event => {
      if (!isHost) return;
      try {
        const message = JSON.parse(String(event.data || "{}"));
        if (message.type === "controls") applyRemoteControlState(message.buttons);
      } catch (error) {
        console.warn("Naya Controle 2:", error);
      }
    });

    const handleClosed = () => {
      if (isHost) releaseHostRemoteButtons();
      else {
        clearInterval(controlHeartbeatTimer);
        controlHeartbeatTimer = null;
        releaseGuestControls();
        updateGuestControlAvailability();
      }
    };
    controlChannel.addEventListener("close", handleClosed);
    controlChannel.addEventListener("error", handleClosed);
  }

  function bindGuestControls() {
    if (isHost) return;

    const setButton = (buttonElement, pressed) => {
      const button = Number(buttonElement.dataset.nayaButton);
      if (!Number.isInteger(button) || buttonElement.disabled) return;
      if (pressed) {
        guestPressedButtons.add(button);
        buttonElement.classList.add("is-pressed");
      } else {
        guestPressedButtons.delete(button);
        buttonElement.classList.remove("is-pressed");
      }
      sendControlState();
    };

    el.controlButtons.forEach(button => {
      button.addEventListener("contextmenu", event => event.preventDefault());
      button.addEventListener("pointerdown", event => {
        event.preventDefault();
        try { button.setPointerCapture(event.pointerId); } catch (_error) {}
        setButton(button, true);
      });
      ["pointerup", "pointercancel", "lostpointercapture"].forEach(type => {
        button.addEventListener(type, event => {
          event.preventDefault();
          setButton(button, false);
        });
      });
    });

    const keyboardMap = new Map([
      ["ArrowUp", 4], ["ArrowDown", 5], ["ArrowLeft", 6], ["ArrowRight", 7],
      ["z", 0], ["a", 1], ["Shift", 2], ["Enter", 3],
      ["x", 8], ["s", 9], ["q", 10], ["w", 11]
    ]);

    const keyboardButton = event => keyboardMap.get(event.key) ?? keyboardMap.get(String(event.key || "").toLowerCase());
    window.addEventListener("keydown", event => {
      const button = keyboardButton(event);
      if (button === undefined || event.repeat || controlChannel?.readyState !== "open") return;
      event.preventDefault();
      guestPressedButtons.add(button);
      sendControlState();
    });
    window.addEventListener("keyup", event => {
      const button = keyboardButton(event);
      if (button === undefined) return;
      event.preventDefault();
      guestPressedButtons.delete(button);
      sendControlState();
    });

    window.addEventListener("blur", releaseGuestControls);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) releaseGuestControls();
    });
  }

  function numericGameId(text) {
    let hash = 0;
    const value = String(text || "retroplay");
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash) || 1;
  }

  async function requireUser() {
    if (!client) throw new Error("Supabase não carregou.");
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    user = data?.session?.user || null;
    if (!user) throw new Error("Entre na sua conta antes de usar a Arena.");
  }

  async function heartbeatRoom() {
    if (!client || !user || !roomCode || roomClosedRedirecting) return;
    try {
      const { error } = await client.rpc("arena_heartbeat", { p_code: roomCode });
      if (error && /ROOM_NOT_FOUND|SALA_NAO_ENCONTRADA/i.test(String(error.message || error))) {
        await handleRoomClosed("A sala foi encerrada pelo outro jogador.");
      }
    } catch (_error) {
      // Uma queda curta do Supabase não deve fechar o jogo.
    }
  }

  async function sendSignal(type, payload = {}) {
    if (!channel) return;
    await channel.send({
      type: "broadcast",
      event: "naya-signal",
      payload: {
        type,
        payload,
        sender: user?.id || "",
        room: roomCode,
        at: Date.now()
      }
    });
  }

  function closePeer() {
    try { controlChannel?.close(); } catch (_error) {}
    controlChannel = null;
    releaseHostRemoteButtons();
    try { peer?.close(); } catch (_error) {}
    peer = null;
    offerInProgress = false;
    remoteDescriptionReady = false;
    queuedCandidates.length = 0;
  }

  function createPeer() {
    if (peer && peer.signalingState !== "closed") return peer;

    peer = new RTCPeerConnection({
      iceServers: Array.isArray(config.iceServers) && config.iceServers.length
        ? config.iceServers
        : [{ urls: "stun:stun.l.google.com:19302" }]
    });

    peer.addEventListener("icecandidate", event => {
      if (event.candidate) {
        sendSignal("ice", event.candidate.toJSON()).catch(console.error);
      }
    });

    if (isHost) {
      bindControlChannel(peer.createDataChannel("naya-controls", { ordered: false, maxRetransmits: 0 }));
    } else {
      peer.addEventListener("datachannel", event => {
        if (event.channel?.label === "naya-controls") bindControlChannel(event.channel);
      });
    }

    peer.addEventListener("connectionstatechange", () => {
      const state = peer?.connectionState || "closed";
      if (state === "connected") {
        setMessage("Naya conectada", "A mesma tela está ligada nos dois aparelhos.", "ok");
        showLoading(false);
        showRetry(false);
      } else if (state === "failed") {
        setMessage("A conexão falhou", "Toque em TENTAR NOVAMENTE.", "error");
        showRetry(true);
        offerInProgress = false;
      } else if (state === "disconnected") {
        setMessage("Conexão oscilando", "Aguardando a internet estabilizar...", "error");
      }
    });

    if (!isHost) {
      peer.addEventListener("track", event => {
        const stream = event.streams?.[0] || new MediaStream([event.track]);
        el.remoteVideo.srcObject = stream;
        el.remoteVideo.hidden = false;
        el.game.hidden = true;
        showLoading(false);
        el.remoteVideo.play().catch(() => {
          setMessage("Toque na tela", "O navegador bloqueou a reprodução automática.", "");
        });
        remoteVideoReceived = true;
        updateGuestControlAvailability();
        setMessage("Imagem recebida", "Você está vendo e controlando o Jogador 2 no mesmo jogo.", "ok");
      });
    }

    return peer;
  }

  async function addIceCandidate(candidate) {
    if (!candidate) return;
    createPeer();
    if (!remoteDescriptionReady || !peer.remoteDescription) {
      queuedCandidates.push(candidate);
      return;
    }
    await peer.addIceCandidate(candidate);
  }

  async function flushIceCandidates() {
    while (queuedCandidates.length) {
      await peer.addIceCandidate(queuedCandidates.shift());
    }
  }

  async function onSignal(message) {
    const data = message?.payload;
    if (!data || data.sender === user?.id || data.room !== roomCode) return;

    if (data.type === "room-closed") {
      await handleRoomClosed(data.payload?.message || "A sala foi encerrada pelo outro jogador.");
      return;
    }

    if (data.type === "guest-ready" && isHost) {
      guestWaiting = true;
      if (data.payload?.retry) closePeer();
      if (localStream) await createOffer();
      else if (emulatorStarted) {
        setMessage("Rival conectado", "Ativando a transmissão automaticamente...", "ok");
        await beginTransmission();
      } else {
        setMessage("Rival conectado", "Inicie o jogo no botão azul do EmulatorJS.", "ok");
      }
      return;
    }

    if (data.type === "offer" && !isHost) {
      if (peer && peer.signalingState !== "stable") closePeer();
      createPeer();
      await peer.setRemoteDescription(data.payload);
      remoteDescriptionReady = true;
      await flushIceCandidates();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendSignal("answer", peer.localDescription);
      setMessage("Conectando ao host", "Recebendo a transmissão do jogo...", "");
      return;
    }

    if (data.type === "answer" && isHost && peer) {
      await peer.setRemoteDescription(data.payload);
      remoteDescriptionReady = true;
      await flushIceCandidates();
      return;
    }

    if (data.type === "ice") {
      await addIceCandidate(data.payload);
    }
  }

  async function connectSignaling() {
    channel = client.channel(`naya-${roomCode}`, {
      config: { broadcast: { self: false }, presence: { key: user.id } }
    });

    channel.on("broadcast", { event: "naya-signal" }, payload => {
      onSignal(payload).catch(error => {
        console.error("Naya signal:", error);
        setMessage("Erro de conexão", error.message || "Falha na sinalização.", "error");
        showRetry(true);
      });
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("O canal da sala demorou para responder.")), 15000);
      channel.subscribe(status => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          resolve();
        }
        if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
          clearTimeout(timeout);
          reject(new Error("Falha no canal em tempo real da sala."));
        }
      });
    });

    await channel.track({
      user_id: user.id,
      role: isHost ? "host" : "guest",
      slot,
      online_at: new Date().toISOString()
    });

    if (!isHost) {
      const announce = () => sendSignal("guest-ready", { slot }).catch(() => {});
      await announce();
      setTimeout(announce, 1000);
      guestAnnounceTimer = setInterval(() => {
        const state = peer?.connectionState || "new";
        if (!["connected"].includes(state)) announce();
      }, 4000);
    }
  }

  function findEmulatorCanvas() {
    const canvases = [...document.querySelectorAll("#game canvas, canvas")]
      .filter(canvas => typeof canvas.captureStream === "function")
      .filter(canvas => (canvas.width || canvas.clientWidth) > 0 && (canvas.height || canvas.clientHeight) > 0)
      .sort((a, b) => {
        const areaA = (a.width || a.clientWidth) * (a.height || a.clientHeight);
        const areaB = (b.width || b.clientWidth) * (b.height || b.clientHeight);
        return areaB - areaA;
      });
    return canvases[0] || null;
  }


  async function waitForEmulatorCanvas(timeoutMs = 5000) {
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeoutMs) {
      const canvas = findEmulatorCanvas();
      if (canvas) return canvas;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
  }

  async function captureGameVideo() {
    if (!emulatorStarted) {
      throw new Error("Primeiro aperte Play no emulador e espere o jogo aparecer.");
    }

    const canvas = await waitForEmulatorCanvas();
    if (!canvas) {
      throw new Error("A tela do jogo ainda não apareceu. Aguarde um instante e tente novamente.");
    }

    localStream?.getTracks().forEach(track => track.stop());
    localStream = canvas.captureStream(Number(config.videoFps) || 30);
    const track = localStream.getVideoTracks()[0];
    if (!track) throw new Error("O navegador não conseguiu capturar o vídeo do jogo.");

    try {
      track.contentHint = "motion";
      await track.applyConstraints({ frameRate: { ideal: 30, max: 30 } });
    } catch (_error) {}

    return localStream;
  }

  async function createOffer() {
    if (!isHost || !localStream || offerInProgress) return;
    offerInProgress = true;

    try {
      closePeer();
      offerInProgress = true;
      createPeer();
      localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendSignal("offer", peer.localDescription);
      setMessage("Conectando o rival", "Enviando a mesma tela do jogo...", "");
    } catch (error) {
      offerInProgress = false;
      throw error;
    }
  }

  async function beginTransmission() {
    if (!isHost || transmissionInProgress) return;
    transmissionInProgress = true;
    showTransmitButton(false);
    showRetry(false);
    setMessage("Preparando transmissão", "Capturando a tela do jogo...", "");

    try {
      await captureGameVideo();
      setMessage(
        "Transmissão pronta",
        guestWaiting ? "Conectando o rival agora..." : "Aguardando o rival entrar.",
        "ok"
      );
      await sendSignal("host-ready", { video: true });
      if (guestWaiting) await createOffer();
    } catch (error) {
      setMessage("Falha na captura", error.message, "error");
      showTransmitButton(true, "TENTAR TRANSMITIR NOVAMENTE");
      throw error;
    } finally {
      transmissionInProgress = false;
    }
  }

  function refreshEmulatorSize() {
    [50, 250, 700].forEach(delay => {
      setTimeout(() => window.dispatchEvent(new Event("resize")), delay);
    });
  }

  function configureAndLoadEmulator(selectedGame) {
    window.EJS_player = "#game";
    window.EJS_core = selectedGame.core;
    window.EJS_gameUrl = selectedGame.rom;
    window.EJS_pathtodata = "https://cdn.emulatorjs.org/stable/data/";
    window.EJS_startOnLoaded = false;
    window.EJS_gameName = selectedGame.nome;
    window.EJS_gameID = numericGameId(selectedGame.id);
    window.EJS_disableAutoUnload = false;
    window.EJS_fixedSaveInterval = 86400000;

    if (selectedGame.bios) window.EJS_biosUrl = selectedGame.bios;

    window.EJS_ready = () => {
      clearTimeout(gameReadyTimer);
      showLoading(false);
      setMessage("Emulador pronto", "Aperte o botão azul Play para iniciar o jogo.", "ok");
      refreshEmulatorSize();
    };

    window.EJS_onGameStart = () => {
      emulatorStarted = true;
      showLoading(false);
      showTransmitButton(false);
      setMessage("Jogo iniciado", "Naya ativando a transmissão automaticamente...", "ok");
      refreshEmulatorSize();
      setTimeout(() => {
        beginTransmission().catch(error => {
          console.error("Transmissão automática:", error);
        });
      }, 150);
    };

    loaderScript = document.createElement("script");
    loaderScript.src = "https://cdn.emulatorjs.org/stable/data/loader.js";
    loaderScript.async = true;
    loaderScript.onerror = () => {
      clearTimeout(gameReadyTimer);
      setMessage("Falha ao carregar", "Não foi possível baixar o EmulatorJS.", "error");
      showRetry(true, "RECARREGAR PLAYER");
    };
    document.body.appendChild(loaderScript);

    gameReadyTimer = setTimeout(() => {
      if (!window.EJS_emulator) {
        setMessage("Player demorando", "Verifique a internet e toque em TENTAR NOVAMENTE.", "error");
        showRetry(true, "RECARREGAR PLAYER");
      }
    }, 20000);
  }

  async function retry() {
    showRetry(false);
    if (isHost) {
      if (!window.EJS_emulator) {
        location.reload();
        return;
      }
      closePeer();
      guestWaiting = true;
      if (!localStream) await beginTransmission();
      else await createOffer();
    } else {
      closePeer();
      setMessage("Tentando novamente", "Procurando o emulador do host...", "");
      await sendSignal("guest-ready", { slot, retry: true });
    }
  }

  function cleanup() {
    clearInterval(heartbeatTimer);
    clearInterval(guestAnnounceTimer);
    clearTimeout(gameReadyTimer);
    clearInterval(controlHeartbeatTimer);
    controlHeartbeatTimer = null;
    releaseGuestControls();
    releaseHostRemoteButtons();
    localStream?.getTracks().forEach(track => track.stop());
    closePeer();
    try { channel?.unsubscribe(); } catch (_error) {}
  }

  function clearLocalRoomState() {
    sessionStorage.removeItem("retroplay-arena-active-code");
  }

  async function handleRoomClosed(message = "A sala foi encerrada.") {
    if (roomClosedRedirecting) return;
    roomClosedRedirecting = true;
    setMessage("Sala encerrada", message, "error");
    showLoading(true);
    clearLocalRoomState();
    cleanup();
    await new Promise(resolve => setTimeout(resolve, 700));
    location.replace("salas.html?encerrada=1");
  }

  async function exitRoom() {
    if (exitInProgress) return;
    const confirmed = window.confirm("Sair e encerrar esta sala para todos os jogadores?");
    if (!confirmed) return;

    exitInProgress = true;
    if (el.exit) {
      el.exit.disabled = true;
      el.exit.textContent = "ENCERRANDO...";
    }
    setMessage("Encerrando sala", "A partida será fechada para os dois jogadores...", "");

    try {
      // Avisa primeiro o outro aparelho para ele sair imediatamente.
      await sendSignal("room-closed", {
        message: "O outro jogador saiu. A sala foi encerrada para todos."
      });
      await new Promise(resolve => setTimeout(resolve, 250));

      const { error } = await client.rpc("arena_leave_room", { p_code: roomCode });
      if (error) throw error;

      clearLocalRoomState();
      cleanup();
      location.replace("salas.html?encerrada=1");
    } catch (error) {
      console.error("Falha ao encerrar sala:", error);
      exitInProgress = false;
      if (el.exit) {
        el.exit.disabled = false;
        el.exit.textContent = "← SAIR E ENCERRAR";
      }
      setMessage("Não foi possível encerrar", error.message || "Tente novamente.", "error");
    }
  }

  async function start() {
    if (!gameId || !roomCode) throw new Error("O convite da partida está incompleto.");

    document.body.classList.toggle("is-host", isHost);
    document.body.classList.toggle("is-guest", !isHost);
    el.role.textContent = isHost ? "HOST · CONTROLE 1" : "CONVIDADO · CONTROLE 2";
    el.game.hidden = !isHost;
    el.remoteVideo.hidden = isHost;
    showTransmitButton(false);
    showRetry(false);
    showRemoteControls(!isHost);
    if (!isHost) {
      setControlsState("Conectando Controle 2...", false);
      bindGuestControls();
    }

    await requireUser();
    await heartbeatRoom();
    heartbeatTimer = setInterval(heartbeatRoom, 20000);

    const response = await fetch("./dados/games.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível carregar o catálogo.");
    const games = await response.json();
    game = games.find(item => String(item.id) === String(gameId));
    if (!game) throw new Error("O jogo da sala não foi encontrado.");

    document.title = `${game.nome} — Naya Engine`;
    el.title.textContent = game.nome;
    el.meta.textContent = `Sala ${roomCode} · ${isHost ? "um emulador principal" : "acesso remoto ao host"}`;

    await connectSignaling();

    if (isHost) {
      setMessage("Naya Engine", "Carregando o único emulador da partida...", "");
      configureAndLoadEmulator(game);
    } else {
      setMessage("Naya Engine", "Aguardando o host abrir o jogo...", "");
    }
  }

  el.exit?.addEventListener("click", () => exitRoom().catch(console.error));
  el.transmitButton?.addEventListener("click", () => beginTransmission().catch(console.error));
  el.retryButton?.addEventListener("click", () => retry().catch(error => {
    setMessage("Falha ao tentar novamente", error.message || "Erro desconhecido.", "error");
  }));
  el.remoteVideo?.addEventListener("click", () => el.remoteVideo.play().catch(() => {}));
  window.addEventListener("pagehide", cleanup);
  window.addEventListener("beforeunload", cleanup);

  start().catch(error => {
    console.error(error);
    setMessage("Não foi possível iniciar", error.message || "Falha desconhecida.", "error");
    showRetry(true);
  });
})();
