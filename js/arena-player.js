// Naya Engine 0.1 — protótipo real de Remote Play (vídeo do host para o convidado).
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
    game: document.querySelector("#game")
  };

  let loader = null;
  let heartbeat = null;
  let user = null;
  let channel = null;
  let peer = null;
  let localStream = null;
  let offerStarted = false;
  const pendingCandidates = [];

  function setMessage(title, message, type = "") {
    el.loadingTitle.textContent = title;
    el.loadingMessage.textContent = message;
    el.serverDot.className = `arena-online-dot${type === "error" ? " error" : type === "ok" ? " ok" : ""}`;
    el.status.textContent = `${title} — ${message}`;
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

  function makePeer() {
    if (peer) return peer;
    peer = new RTCPeerConnection({ iceServers: config.iceServers || [] });

    peer.onicecandidate = event => {
      if (!event.candidate) return;
      sendSignal("ice", event.candidate.toJSON());
    };

    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      if (state === "connected") {
        setMessage("Naya conectada", "Os dois jogadores estão vendo o mesmo emulador.", "ok");
        el.loading.classList.add("hidden");
      } else if (["failed", "disconnected"].includes(state)) {
        setMessage("Conexão instável", "Naya está tentando manter a sessão.", "error");
      }
    };

    if (!isHost) {
      peer.ontrack = event => {
        const [stream] = event.streams;
        if (!stream) return;
        el.remoteVideo.srcObject = stream;
        el.remoteVideo.hidden = false;
        el.game.hidden = true;
        el.remoteVideo.play().catch(() => {});
        setMessage("Imagem recebida", "Você está assistindo ao emulador do host em tempo real.", "ok");
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
      const candidate = pendingCandidates.shift();
      await peer.addIceCandidate(candidate);
    }
  }

  async function onSignal(message) {
    const data = message?.payload;
    if (!data || data.sender === user?.id || data.room !== roomCode) return;

    if (data.type === "guest-ready" && isHost) {
      await createOffer();
      return;
    }

    if (data.type === "offer" && !isHost) {
      makePeer();
      await peer.setRemoteDescription(data.payload);
      await flushCandidates();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendSignal("answer", peer.localDescription);
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
      onSignal(payload).catch(error => console.error("Naya signal:", error));
    });

    await new Promise((resolve, reject) => {
      channel.subscribe(status => {
        if (status === "SUBSCRIBED") resolve();
        if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) reject(new Error("Falha no canal da sala."));
      });
    });

    await channel.track({ user_id: user.id, role: isHost ? "host" : "guest", slot, online_at: new Date().toISOString() });

    if (!isHost) {
      setMessage("Sala encontrada", "Aguardando a imagem do host...", "");
      await sendSignal("guest-ready", { slot });
      setTimeout(() => sendSignal("guest-ready", { slot }).catch(() => {}), 1500);
      setInterval(() => {
        if (!peer || ["new", "connecting", "disconnected"].includes(peer.connectionState)) {
          sendSignal("guest-ready", { slot }).catch(() => {});
        }
      }, 5000);
    }
  }

  async function waitForCanvas(timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const canvases = [...document.querySelectorAll("#game canvas")];
      const canvas = canvases.find(item => item.width > 160 && item.height > 100) || canvases[0];
      if (canvas?.captureStream) return canvas;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error("A tela do emulador não ficou disponível para transmissão.");
  }

  async function prepareHostStream() {
    const canvas = await waitForCanvas();
    localStream = canvas.captureStream(60);
    if (!localStream.getVideoTracks().length) throw new Error("Não foi possível capturar o vídeo do jogo.");
    setMessage("Emulador pronto", "Aguardando o rival entrar na transmissão.", "ok");
    if (channel) await sendSignal("host-ready", { video: true });
  }

  async function createOffer() {
    if (!isHost || !localStream || offerStarted) return;
    offerStarted = true;
    try {
      makePeer();
      localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
      const offer = await peer.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
      await peer.setLocalDescription(offer);
      await sendSignal("offer", peer.localDescription);
      setMessage("Conectando rival", "Enviando a imagem do mesmo emulador.", "");
    } catch (error) {
      offerStarted = false;
      throw error;
    }
  }

  async function loadHostGame(game) {
    window.EJS_player = "#game";
    window.EJS_core = game.core;
    window.EJS_gameUrl = game.rom;
    window.EJS_gameName = game.nome;
    window.EJS_startOnLoaded = false;
    window.EJS_disableAutoUnload = false;
    window.EJS_pathtodata = `https://cdn.emulatorjs.org/${config.emulatorVersion || "4.3.0-pre"}/data/`;
    window.EJS_ready = () => {
      setMessage("Emulador carregado", "Aperte Play. A Naya transmitirá esta mesma tela ao rival.", "ok");
      prepareHostStream().catch(error => setMessage("Falha na captura", error.message, "error"));
      window.dispatchEvent(new Event("resize"));
    };
    window.EJS_onGameStart = () => {
      prepareHostStream().catch(error => setMessage("Falha na captura", error.message, "error"));
    };

    loader = document.createElement("script");
    loader.src = `https://cdn.emulatorjs.org/${config.emulatorVersion || "4.3.0-pre"}/data/loader.js`;
    loader.async = true;
    loader.onerror = () => setMessage("Falha ao carregar", "O emulador não pôde ser baixado.", "error");
    document.body.appendChild(loader);
  }

  function cleanup() {
    clearInterval(heartbeat);
    localStream?.getTracks().forEach(track => track.stop());
    peer?.close();
    channel?.unsubscribe();
    loader?.remove();
  }

  async function exitRoom() {
    cleanup();
    location.replace(`salas.html?codigo=${encodeURIComponent(roomCode)}`);
  }

  async function start() {
    if (!gameId || !roomCode) throw new Error("Convite incompleto.");
    el.role.textContent = isHost ? "HOST · CONTROLE 1" : "CONVIDADO · CONTROLE 2";
    el.game.hidden = !isHost;
    el.remoteVideo.hidden = isHost;

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
    el.meta.textContent = `Sala ${roomCode} · ${isHost ? "um emulador principal" : "acesso remoto ao host"}`;

    await connectSignaling();

    if (isHost) {
      setMessage("Naya Engine", "Carregando o único emulador da partida...", "");
      await loadHostGame(game);
    } else {
      setMessage("Naya Engine", "Conectando ao emulador do host...", "");
    }
  }

  el.exit.addEventListener("click", exitRoom);
  window.addEventListener("pagehide", cleanup);
  window.addEventListener("beforeunload", cleanup);

  start().catch(error => {
    console.error(error);
    setMessage("Não foi possível iniciar", error.message || "Falha desconhecida.", "error");
  });
})();
