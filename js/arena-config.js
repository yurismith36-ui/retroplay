// Naya Engine — configuração segura para produção.
// A Arena usa a mesma versão estável do player normal do RetroPlay.
window.RETROPLAY_ARENA_CONFIG = Object.freeze({
  emulatorVersion: "stable",
  videoFps: 30,
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
});
