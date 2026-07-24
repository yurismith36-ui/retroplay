// RetroPlay Cloud 2.0 — estado automático do jogo
(() => {
  const INTERVAL_MS = 10000;
  const SLOT = 99; // slot reservado para o estado automático
  let gameId = null;
  let timer = null;
  let running = false;
  let lastHash = "";
  let restored = false;
  let blobUrl = null;

  const statusEl = () => document.querySelector('#cloud-save-status');
  function setStatus(kind, text) {
    const el = statusEl();
    if (!el) return;
    el.className = `cloud-save-status ${kind}`;
    el.textContent = text;
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function fastHash(bytes) {
    let hash = 2166136261;
    for (let i = 0; i < bytes.length; i += Math.max(1, Math.floor(bytes.length / 5000))) {
      hash ^= bytes[i];
      hash = Math.imul(hash, 16777619);
    }
    return `${bytes.length}-${hash >>> 0}`;
  }

  function getStateBytes() {
    const gm = window.EJS_emulator?.gameManager;
    if (!gm || typeof gm.getState !== 'function') return null;
    const state = gm.getState();
    if (!state) return null;
    return state instanceof Uint8Array ? state : new Uint8Array(state);
  }

  async function saveNow(force = false) {
    if (running || !gameId) return false;
    const user = window.RetroPlayAuth?.getUser();
    if (!user) {
      setStatus('offline', '☁️ Entre para usar a nuvem');
      return false;
    }
    const bytes = getStateBytes();
    if (!bytes?.length) return false;
    const hash = fastHash(bytes);
    if (!force && hash === lastHash) return true;

    running = true;
    setStatus('syncing', '☁️ Salvando...');
    try {
      await window.RetroPlayCloud.saveGame(gameId, SLOT, bytesToBase64(bytes), {
        type: 'auto-state', hash, size: bytes.length,
        device: navigator.userAgent, saved_at: new Date().toISOString()
      });
      lastHash = hash;
      setStatus('synced', `☁️ Salvo às ${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}`);
      return true;
    } catch (error) {
      console.warn('Cloud Save não enviado:', error);
      setStatus('error', navigator.onLine ? '☁️ Erro ao salvar' : '☁️ Sem internet');
      return false;
    } finally {
      running = false;
    }
  }

  async function prepare(game) {
    gameId = game.id;
    const user = window.RetroPlayAuth?.getUser();
    if (!user) {
      setStatus('offline', '☁️ Save local — entre para sincronizar');
      return null;
    }
    setStatus('syncing', '☁️ Procurando save...');
    try {
      const row = await window.RetroPlayCloud.loadGameSave(gameId, SLOT);
      if (!row?.save_data) {
        setStatus('synced', '☁️ Nuvem ativa');
        return null;
      }
      const bytes = base64ToBytes(row.save_data);
      lastHash = row.metadata?.hash || fastHash(bytes);
      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      blobUrl = URL.createObjectURL(blob);
      restored = true;
      setStatus('synced', '☁️ Último jogo restaurado');
      return blobUrl;
    } catch (error) {
      console.warn('Cloud Save não carregado:', error);
      setStatus('error', '☁️ Nuvem indisponível');
      return null;
    }
  }

  function start() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => saveNow(false), INTERVAL_MS);
    setTimeout(() => saveNow(false), 5000);
  }

  async function stopAndSave() {
    if (timer) clearInterval(timer);
    timer = null;
    await saveNow(true);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow(true);
  });
  window.addEventListener('online', () => saveNow(true));
  window.addEventListener('pagehide', () => saveNow(true));
  window.addEventListener('beforeunload', () => saveNow(true));
  window.addEventListener('unload', () => { if (blobUrl) URL.revokeObjectURL(blobUrl); });

  window.RetroPlayAutoSave = { prepare, start, saveNow, stopAndSave, wasRestored: () => restored };
})();
