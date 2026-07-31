// RetroPlay Arena Voice 1.0 — chat de voz WebRTC leve, sem vídeo.
(() => {
  "use strict";

  const client = window.retroplaySupabase;
  const config = window.RETROPLAY_ARENA_CONFIG || {};
  const params = new URLSearchParams(location.search);
  const roomCode = (params.get("sala") || sessionStorage.getItem("retroplay-arena-active-code") || "").toUpperCase();
  const isPlayerPage = location.pathname.endsWith("arena-player.html");
  const preferredEnabled = localStorage.getItem("retroplay-arena-voice-enabled") !== "0";

  const ui = {
    root: document.querySelector("#arena-voice"),
    toggle: document.querySelector("#arena-voice-toggle"),
    mute: document.querySelector("#arena-voice-mute"),
    status: document.querySelector("#arena-voice-status"),
    remote: document.querySelector("#arena-voice-remote")
  };

  if (!client || !roomCode || !ui.root || !ui.toggle || !ui.mute || !ui.status || !ui.remote) return;

  const state = {
    user: null,
    channel: null,
    peer: null,
    stream: null,
    enabled: false,
    muted: false,
    initiator: params.get("host") === "1",
    peerOnline: false,
    makingOffer: false,
    ignoreOffer: false
  };

  function setStatus(text, kind = "") {
    ui.status.textContent = text;
    ui.status.dataset.kind = kind;
  }

  function updateButtons() {
    ui.toggle.textContent = state.enabled ? "DESLIGAR VOZ" : "ATIVAR VOZ";
    ui.mute.hidden = !state.enabled;
    ui.mute.textContent = state.muted ? "REATIVAR MICROFONE" : "SILENCIAR MICROFONE";
    ui.root.classList.toggle("active", state.enabled);
  }

  async function send(type, payload = {}) {
    if (!state.channel || !state.user) return;
    await state.channel.send({
      type: "broadcast",
      event: "voice-signal",
      payload: { type, sender: state.user.id, ...payload }
    });
  }

  function destroyPeer() {
    if (state.peer) {
      state.peer.onicecandidate = null;
      state.peer.ontrack = null;
      state.peer.onconnectionstatechange = null;
      state.peer.close();
      state.peer = null;
    }
    ui.remote.srcObject = null;
  }

  function createPeer() {
    if (state.peer) return state.peer;
    const peer = new RTCPeerConnection({ iceServers: config.iceServers || [{ urls: "stun:stun.l.google.com:19302" }] });
    state.peer = peer;

    for (const track of state.stream?.getTracks() || []) peer.addTrack(track, state.stream);

    peer.onicecandidate = event => {
      if (event.candidate) send("candidate", { candidate: event.candidate }).catch(console.warn);
    };
    peer.ontrack = event => {
      ui.remote.srcObject = event.streams[0];
      ui.remote.play().catch(() => {});
      setStatus("VOZ CONECTADA — BAIXO DELAY", "ok");
    };
    peer.onconnectionstatechange = () => {
      const value = peer.connectionState;
      if (value === "connected") setStatus("VOZ CONECTADA — BAIXO DELAY", "ok");
      else if (value === "connecting") setStatus("CONECTANDO A VOZ...", "wait");
      else if (["failed", "disconnected"].includes(value)) setStatus("RECONECTANDO A VOZ...", "error");
      else if (value === "closed") setStatus("VOZ DESLIGADA");
    };
    peer.onnegotiationneeded = async () => {
      if (!state.initiator || !state.peerOnline) return;
      try {
        state.makingOffer = true;
        await peer.setLocalDescription();
        await send("description", { description: peer.localDescription });
      } catch (error) {
        console.warn("Falha na oferta de voz:", error);
      } finally {
        state.makingOffer = false;
      }
    };
    return peer;
  }

  async function handleSignal(payload) {
    if (!state.user || payload.sender === state.user.id) return;
    if (payload.type === "hello") {
      state.peerOnline = true;
      await send("hello-ack");
      if (state.enabled) {
        createPeer();
        if (state.initiator) {
          const offer = await state.peer.createOffer();
          await state.peer.setLocalDescription(offer);
          await send("description", { description: state.peer.localDescription });
        }
      }
      return;
    }
    if (payload.type === "hello-ack") {
      state.peerOnline = true;
      if (state.enabled && state.initiator) {
        createPeer();
        const offer = await state.peer.createOffer();
        await state.peer.setLocalDescription(offer);
        await send("description", { description: state.peer.localDescription });
      }
      return;
    }
    if (payload.type === "voice-off") {
      state.peerOnline = false;
      destroyPeer();
      if (state.enabled) setStatus("AGUARDANDO O OPONENTE ATIVAR A VOZ", "wait");
      return;
    }
    if (!state.enabled) return;

    const peer = createPeer();
    if (payload.type === "description" && payload.description) {
      const description = payload.description;
      const offerCollision = description.type === "offer" && (state.makingOffer || peer.signalingState !== "stable");
      state.ignoreOffer = !state.initiator && offerCollision;
      if (state.ignoreOffer) return;
      await peer.setRemoteDescription(description);
      if (description.type === "offer") {
        await peer.setLocalDescription(await peer.createAnswer());
        await send("description", { description: peer.localDescription });
      }
    } else if (payload.type === "candidate" && payload.candidate) {
      try { await peer.addIceCandidate(payload.candidate); }
      catch (error) { if (!state.ignoreOffer) throw error; }
    }
  }

  async function enableVoice() {
    if (state.enabled) return disableVoice();
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      setStatus("ESTE NAVEGADOR NÃO SUPORTA CHAT DE VOZ", "error");
      return;
    }
    try {
      setStatus("PEDINDO ACESSO AO MICROFONE...", "wait");
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
      });
      state.enabled = true;
      state.muted = false;
      localStorage.setItem("retroplay-arena-voice-enabled", "1");
      createPeer();
      updateButtons();
      setStatus("AGUARDANDO O OPONENTE...", "wait");
      await send("hello");
    } catch (error) {
      console.warn(error);
      setStatus("MICROFONE BLOQUEADO. PERMITA O ACESSO NO NAVEGADOR/APP.", "error");
    }
  }

  async function disableVoice() {
    state.enabled = false;
    localStorage.setItem("retroplay-arena-voice-enabled", "0");
    await send("voice-off");
    destroyPeer();
    for (const track of state.stream?.getTracks() || []) track.stop();
    state.stream = null;
    state.muted = false;
    updateButtons();
    setStatus("VOZ DESLIGADA");
  }

  function toggleMute() {
    if (!state.stream) return;
    state.muted = !state.muted;
    for (const track of state.stream.getAudioTracks()) track.enabled = !state.muted;
    updateButtons();
    setStatus(state.muted ? "SEU MICROFONE ESTÁ SILENCIADO" : (state.peer?.connectionState === "connected" ? "VOZ CONECTADA — BAIXO DELAY" : "MICROFONE ATIVO"), state.muted ? "wait" : "ok");
  }

  async function initialize(user) {
    if (!user || state.channel) return;
    state.user = user;
    state.channel = client.channel(`arena-voice-${roomCode}`, { config: { broadcast: { self: false } } });
    state.channel.on("broadcast", { event: "voice-signal" }, ({ payload }) => handleSignal(payload).catch(console.warn));
    state.channel.subscribe(async status => {
      if (status === "SUBSCRIBED") {
        setStatus("CHAT DE VOZ PRONTO");
        if (preferredEnabled && isPlayerPage) await enableVoice();
      }
    });
  }

  ui.toggle.addEventListener("click", () => enableVoice());
  ui.mute.addEventListener("click", toggleMute);
  updateButtons();

  window.RetroPlayAuth?.onChange(initialize);
  window.addEventListener("pagehide", () => {
    for (const track of state.stream?.getTracks() || []) track.stop();
    destroyPeer();
    if (state.channel) client.removeChannel(state.channel);
  });
})();
