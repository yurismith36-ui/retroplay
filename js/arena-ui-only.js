// Naya UI 0.4.7 — SOMENTE interface.
// Este arquivo não toca em EmulatorJS, ROM, WebRTC, Supabase, salas ou conexão.
(() => {
  "use strict";

  const body = document.body;
  const stage = document.querySelector("#arena-player-stage");
  const remoteVideo = document.querySelector("#naya-remote-video");
  const voicePanel = document.querySelector("#naya-voice-panel");
  const fullscreenButton = document.querySelector("#naya-ui-fullscreen");
  const controlsButton = document.querySelector("#naya-ui-controls");
  const voiceButton = document.querySelector("#naya-ui-voice");

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      // iPhone/iPad: vídeo remoto pode entrar em tela cheia pelo próprio elemento.
      if (remoteVideo && remoteVideo.srcObject && typeof remoteVideo.webkitEnterFullscreen === "function") {
        remoteVideo.webkitEnterFullscreen();
        return;
      }

      const target = stage || document.documentElement;
      const request = target.requestFullscreen || target.webkitRequestFullscreen;
      if (request) {
        await request.call(target);
        return;
      }

      // Reserva visual para navegadores que não oferecem Fullscreen API.
      body.classList.toggle("naya-ui-pseudo-fullscreen");
      fullscreenButton?.classList.toggle("is-active", body.classList.contains("naya-ui-pseudo-fullscreen"));
    } catch (error) {
      console.warn("Naya UI: tela cheia indisponível.", error);
      body.classList.toggle("naya-ui-pseudo-fullscreen");
    }
  }

  function syncFullscreenState() {
    fullscreenButton?.classList.toggle("is-active", Boolean(document.fullscreenElement) || body.classList.contains("naya-ui-pseudo-fullscreen"));
  }

  function toggleControls() {
    const hidden = body.classList.toggle("naya-ui-controls-hidden");
    controlsButton?.classList.toggle("is-active", !hidden);
    controlsButton?.setAttribute("aria-label", hidden ? "Mostrar controles" : "Ocultar controles");
  }

  function toggleVoicePanel() {
    if (!voicePanel) return;
    const collapsed = voicePanel.classList.toggle("naya-ui-collapsed");
    voiceButton?.classList.toggle("is-active", !collapsed);
    voiceButton?.setAttribute("aria-expanded", String(!collapsed));
  }

  fullscreenButton?.addEventListener("click", toggleFullscreen);
  controlsButton?.addEventListener("click", toggleControls);
  voiceButton?.addEventListener("click", toggleVoicePanel);
  document.addEventListener("fullscreenchange", syncFullscreenState);
  document.addEventListener("webkitfullscreenchange", syncFullscreenState);

  controlsButton?.classList.add("is-active");
  voiceButton?.setAttribute("aria-expanded", "false");
})();
