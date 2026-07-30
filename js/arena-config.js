// RetroPlay Arena 2.0 — configuração isolada do netplay beta.
// O player normal continua usando a versão estável do EmulatorJS.
window.RETROPLAY_ARENA_CONFIG = Object.freeze({
  emulatorVersion: "4.3.0-pre",
  netplayServer: "https://netplay.emulatorjs.org/",
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
});
