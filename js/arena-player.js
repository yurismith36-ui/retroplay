// Naya Engine 0.3 SAFE — player estável + captura do canvas com fallback de compartilhamento da aba.
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
    retryButton: document.querySelector("#naya-retry")
  };

  let loader = null;
  let heartbeat = null;
  let canvasObserver = null;
  let canvasPoll = null;
  let user = null;
  let channel = null;
  let peer = null;
  let localStream = null;
  let capturedCanvas = null;
  let offerStarted = false;
  let guestWaiting = false;
  let captureInProgress = false;
  const pendingCandidates = [];

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
    el.transmitButton.textContent = text;
    el.transmitButton.hidden = !show;
    el.transmitButton.disabled = false;
  }

  function showRetry(show) {
    if (el.retryButton) el.retryButton.hidden = !show;
  }

  async function getUser() {
    if (!client) throw new Error("Supabase não carregou.");
    const { data } = await client.auth.getSession();
    user = data?.session?.user || null;
    if (!user) throw new Error("Entre na conta antes de usar a Naya Engine.");
  }

  async function heartbeatRoom() {
    if (!client || !user || !roomCode) return;
    try { await client.rpc("arena_heartbeat", { p_code: roomCode }); } catch (_error) {}
  }

  function resetPeer() {
    try { peer?.close(); } catch (_error) {}
    peer = null;
    offerStarted = false;
    pendingCandidates.length = 0;
  }

  function makePeer() {
    if (peer && peer.connectionState !== "closed") return peer;

    peer = new RTCPeerConnection({
      iceServers: config.iceServers?.length
        ? config.iceServers
        : [{ urls: "stun:stun.l.google.com:19302" }]
    });

    peer.onicecandidate = event => {
      if (event.candidate) sendSignal("ice", event.candidate.toJSON()).catch(console.error);
    };

    peer.onconnectionstatechange = () => {
      const state = peer?.connectionState || "closed";
      if (state === "connected") {
        setMessage("Naya conectada", "Os dois jogadores estão vendo o mesmo emulador.", "ok");
        showLoading(false);
        showRetry(false);
      } else if (state === "failed") {
        setMessage("A conexão falhou", "Toque em tentar novamente.", "error");
        showRetry(true);
        offerStarted = false;
      } else if (state === "disconnected") {
        setMessage("Conexão oscilando", "A Naya está tentando reconectar.", "error");
      }
    };

    if (!isHost) {
      peer.ontrack = event => {
        const stream = event.streams?.[0] || new MediaStream([event.track]);
        el.remoteVideo.srcObject = stream;
        el.remoteVideo.hidden = false;
        el.game.hidden = true;
        showLoading(false);
        el.remoteVideo.play().catch(() => {
          setMessage("Toque para assistir", "O navegador bloqueou a reprodução automática.", "");
        });
        setMessage("Imagem recebida", "Você está vendo o mesmo emulador do host.", "ok");
      };
    }

    return peer;
  }

  async function sendSignal(type, payload = {}) {
    if (!channel) return;
    await channel.send({
      type: "broadcast",
      event: "naya-signal",
      payload: { type, payload, sender: user?.id || "", room: roomCode, at: Date.now() }
    });
  }

  async function addCandidate(candidate) {
    if (!candidate) return;
    if (!peer?.remoteDescription) {
      pendingCandidates.push(candidate);
      return;
    }
    await peer.addIceCandidate(candidate);
  }

  async function flushCandidates() {
    while (pendingCandidates.length) {
      await peer.addIceCandidate(pendingCandidates.shift());
    }
  }

  async function onSignal(message) {
    const data = message?.payload;
    if (!data || data.sender === user?.id || data.room !== roomCode) return;

    if (data.type === "guest-ready" && isHost) {
      guestWaiting = true;
      if (localStream) await createOffer();
      else setMessage("Rival conectado", "Abra o jogo e toque em INICIAR TRANSMISSÃO.", "ok");
      return;
    }

    if (data.type === "offer" && !isHost) {
      resetPeer();
      makePeer();
      await peer.setRemoteDescription(data.payload);
      await flushCandidates();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendSignal("answer", peer.localDescription);
      setMessage("Conectando ao host", "Negociando a transmissão de vídeo...", "");
      return;
    }

    if (data.type === "answer" && isHost && peer) {
      await peer.setRemoteDescription(data.payload);
      await flushCandidates();
      return;
    }

    if (data.type === "ice") {
      makePeer();
      await addCandidate(data.payload);
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
      });
    });

    await new Promise((resolve, reject) => {
      channel.subscribe(status => {
        if (status === "SUBSCRIBED") resolve();
        if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) reject(new Error("Falha no canal da sala."));
      });
    });

    await channel.track({
      user_id: user.id,
      role: isHost ? "host" : "guest",
      slot,
      online_at: new Date().toISOString()
    });

    if (!isHost) {
      setMessage("Sala encontrada", "Aguardando o host iniciar a transmissão...", "");
      const announce = () => sendSignal("guest-ready", { slot }).catch(() => {});
      await announce();
      setTimeout(announce, 1200);
      setInterval(() => {
        if (!peer || ["new", "connecting", "disconnected", "failed"].includes(peer.connectionState)) announce();
      }, 4000);
    }
  }

  function collectCanvases(root, output = [], visited = new Set()) {
    if (!root || visited.has(root)) return output;
    visited.add(root);

    try {
      if (root instanceof HTMLCanvasElement) output.push(root);
      root.querySelectorAll?.("canvas").forEach(canvas => output.push(canvas));

      root.querySelectorAll?.("*").forEach(node => {
        if (node.shadowRoot) collectCanvases(node.shadowRoot, output, visited);
      });

      root.querySelectorAll?.("iframe").forEach(frame => {
        try {
          if (frame.contentDocument) collectCanvases(frame.contentDocument, output, visited);
        } catch (_error) {
          // Um iframe de outro domínio não pode ser lido pelo navegador.
        }
      });
    } catch (_error) {}

    return [...new Set(output)];
  }

  function findEmulatorCanvas() {
    const roots = [el.game, document];
    const canvases = roots.flatMap(root => collectCanvases(root));
    const usable = canvases.filter(canvas => typeof canvas.captureStream === "function");
    usable.sort((a, b) => ((b.width || b.clientWidth) * (b.height || b.clientHeight)) - ((a.width || a.clientWidth) * (a.height || a.clientHeight)));
    return usable.find(canvas => (canvas.width || canvas.clientWidth) > 0 && (canvas.height || canvas.clientHeight) > 0) || usable[0] || null;
  }

  function watchForCanvas() {
    const check = () => {
      const canvas = findEmulatorCanvas();
      if (!canvas) return false;
      capturedCanvas = canvas;
      showTransmitButton(true);
      setMessage("Emulador encontrado", "Aperte Play no jogo e depois INICIAR TRANSMISSÃO.", "ok");
      return true;
    };

    if (check()) return;

    canvasObserver?.disconnect();
    canvasObserver = new MutationObserver(check);
    canvasObserver.observe(document.body, { childList: true, subtree: true });
    clearInterval(canvasPoll);
    canvasPoll = setInterval(check, 750);
  }

  async function captureCanvasStream() {
    capturedCanvas = findEmulatorCanvas() || capturedCanvas;
    if (!capturedCanvas) throw new Error("CANVAS_NOT_FOUND");

    const width = capturedCanvas.width || capturedCanvas.clientWidth || 0;
    const height = capturedCanvas.height || capturedCanvas.clientHeight || 0;
    if (width < 16 || height < 16) throw new Error("CANVAS_NOT_READY");

    localStream?.getTracks().forEach(track => track.stop());
    localStream = capturedCanvas.captureStream(30);
    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) throw new Error("CANVAS_NO_VIDEO");

    try {
      videoTrack.contentHint = "motion";
      await videoTrack.applyConstraints({ frameRate: { ideal: 30, max: 45 } });
    } catch (_error) {}

    return localStream;
  }

  async function prepareHostStream() {
    if (!isHost || captureInProgress) return;
    captureInProgress = true;
    showRetry(false);
    if (el.transmitButton) {
      el.transmitButton.disabled = true;
      el.transmitButton.textContent = "PREPARANDO...";
    }

    try {
      try {
        await captureCanvasStream();
        setMessage("Canvas capturado", "A imagem do jogo será enviada diretamente.", "ok");
      } catch (canvasError) {
        console.warn("Captura direta indisponível; usando compartilhamento da aba.", canvasError);
        localStream?.getTracks().forEach(track => track.stop());
        localStream = await captureCurrentTabFallback();
      }
      showTransmitButton(false);
      setMessage("Transmissão pronta", guestWaiting ? "Conectando o rival agora..." : "Aguardando o rival entrar.", "ok");
      await sendSignal("host-ready", { video: true });
      if (guestWaiting) await createOffer();
    } catch (error) {
      showTransmitButton(true, "COMPARTILHAR ESTA ABA");
      const message = error?.name === "NotAllowedError"
        ? "O compartilhamento foi cancelado. Clique e escolha esta aba do RetroPlay."
        : (error.message || "Não foi possível capturar a imagem.");
      setMessage("Transmissão não iniciada", message, "error");
    } finally {
      captureInProgress = false;
    }
  }

  async function createOffer() {
    if (!isHost || !localStream || offerStarted) return;
    offerStarted = true;

    try {
      resetPeer();
      offerStarted = true;
      makePeer();
      localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendSignal("offer", peer.localDescription);
      setMessage("Conectando rival", "Enviando a tela do mesmo emulador.", "");
    } catch (error) {
      offerStarted = false;
      throw error;
    }
  }

  async function retryConnection() {
    showRetry(false);
    resetPeer();
    if (isHost) {
      guestWaiting = true;
      if (!localStream) await prepareHostStream();
      else await createOffer();
    } else {
      setMessage("Tentando novamente", "Procurando o emulador do host...", "");
      await sendSignal("guest-ready", { slot, retry: true });
    }
  }

  function numericGameId(text) {
    let hash = 0;
    const value = String(text || "game");
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash) || 1;
  }

  async function captureCurrentTabFallback() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("Este navegador não oferece compartilhamento de tela.");
    }

    setMessage("Selecione esta aba", "Na janela que abrir, escolha a aba do RetroPlay e marque compartilhar áudio.", "");
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 45 } },
      audio: true,
      preferCurrentTab: true,
      selfBrowserSurface: "include",
      surfaceSwitching: "include"
    });

    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error("Nenhuma imagem foi compartilhada.");
    track.contentHint = "motion";
    track.addEventListener("ended", () => {
      localStream = null;
      offerStarted = false;
      showTransmitButton(true, "COMPARTILHAR ESTA ABA");
      setMessage("Transmissão encerrada", "Clique para compartilhar novamente.", "error");
    }, { once: true });
    return stream;
  }

  async function loadHostGame(game) {
    window.EJS_player = "#game";
    window.EJS_core = game.core;
    window.EJS_gameUrl = game.rom;
    window.EJS_gameName = game.nome;
    window.EJS_gameID = numericGameId(game.id);
    window.EJS_startOnLoaded = false;
    window.EJS_disableAutoUnload = false;
    window.EJS_pathtodata = `https://cdn.emulatorjs.org/${config.emulatorVersion || "stable"}/data/`;
    if (game.bios) window.EJS_biosUrl = game.bios;

    window.EJS_ready = () => {
      showLoading(false);
      setMessage("Emulador carregado", "Aperte Play. A Naya detectará a tela automaticamente.", "ok");
      watchForCanvas();
      window.dispatchEvent(new Event("resize"));
    };

    window.EJS_onGameStart = () => {
      watchForCanvas();
      setTimeout(() => {
        if (findEmulatorCanvas()) {
          showTransmitButton(true);
          setMessage("Jogo iniciado", "Toque em INICIAR TRANSMISSÃO.", "ok");
        }
      }, 500);
    };

    loader = document.createElement("script");
    loader.src = `https://cdn.emulatorjs.org/${config.emulatorVersion || "stable"}/data/loader.js`;
    loader.async = true;
    loader.onload = () => {
      setMessage("Emulador carregado", "Aperte Play para iniciar o jogo.", "ok");
      watchForCanvas();
      window.dispatchEvent(new Event("resize"));
    };
    loader.onerror = () => setMessage("Falha ao carregar", "O emulador não pôde ser baixado.", "error");
    document.body.appendChild(loader);
  }

  function cleanup() {
    clearInterval(heartbeat);
    clearInterval(canvasPoll);
    canvasObserver?.disconnect();
    localStream?.getTracks().forEach(track => track.stop());
    resetPeer();
    channel?.unsubscribe();
    loader?.remove();
  }

  function exitRoom() {
    cleanup();
    location.replace(`salas.html?codigo=${encodeURIComponent(roomCode)}`);
  }

  async function start() {
    if (!gameId || !roomCode) throw new Error("Convite incompleto.");
    el.role.textContent = isHost ? "HOST · CONTROLE 1" : "CONVIDADO · TELA REMOTA";
    el.game.hidden = !isHost;
    el.remoteVideo.hidden = isHost;
    showTransmitButton(false);
    showRetry(false);

    await getUser();
    heartbeatRoom();
    heartbeat = setInterval(heartbeatRoom, 20000);

    const response = await fetch("./dados/games.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível carregar o catálogo.");
    const games = await response.json();
    const game = games.find(item => String(item.id) === String(gameId));
    if (!game) throw new Error("Jogo da sala não encontrado.");

    document.title = `${game.nome} — Naya Engine`;
    el.title.textContent = game.nome;
    el.meta.textContent = `Sala ${roomCode} · ${isHost ? "emulador principal" : "mesma tela do host"}`;

    await connectSignaling();

    if (isHost) {
      setMessage("Naya Engine", "Carregando o único emulador da partida...", "");
      await loadHostGame(game);
    } else {
      setMessage("Naya Engine", "Conectando ao emulador do host...", "");
    }
  }

  el.exit?.addEventListener("click", exitRoom);
  el.transmitButton?.addEventListener("click", () => prepareHostStream().catch(console.error));
  el.retryButton?.addEventListener("click", () => retryConnection().catch(error => setMessage("Falha ao reconectar", error.message, "error")));
  el.remoteVideo?.addEventListener("click", () => el.remoteVideo.play().catch(() => {}));
  window.addEventListener("pagehide", cleanup);
  window.addEventListener("beforeunload", cleanup);

  start().catch(error => {
    console.error(error);
    setMessage("Não foi possível iniciar", error.message || "Falha desconhecida.", "error");
    showRetry(true);
  });
})();
