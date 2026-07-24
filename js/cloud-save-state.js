// RetroPlay Cloud 2.2 — restauração atrasada para evitar tela preta no iPhone
(() => {
  const INTERVAL_MS = 10000;
  const SLOT = 10;
  const RESTORE_DELAYS = [900, 1700, 2800];

  let gameId = null;
  let timer = null;
  let running = false;
  let lastHash = "";
  let restored = false;
  let pendingState = null;
  let restoreRunning = false;

  const statusEl = () => document.querySelector('#cloud-save-status');

  function setStatus(kind, text) {
    const el = statusEl();
    if (!el) return;
    el.className = `cloud-save-status ${kind}`;
    el.textContent = text;
  }

  function wait(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
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
    const step = Math.max(1, Math.floor(bytes.length / 5000));
    for (let i = 0; i < bytes.length; i += step) {
      hash ^= bytes[i];
      hash = Math.imul(hash, 16777619);
    }
    return `${bytes.length}-${hash >>> 0}`;
  }

  function getGameManager() {
    return window.EJS_emulator?.gameManager || null;
  }

  function getStateBytes() {
    const gm = getGameManager();
    if (!gm || typeof gm.getState !== 'function') return null;
    const state = gm.getState();
    if (!state) return null;
    return state instanceof Uint8Array ? state : new Uint8Array(state);
  }

  function emulatorCanvasReady() {
    const canvas = document.querySelector('#game canvas');
    if (!canvas) return false;
    return canvas.width > 0 && canvas.height > 0;
  }

  async function waitForGameManager(timeoutMs = 12000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const gm = getGameManager();
      if (gm && typeof gm.loadState === 'function' && emulatorCanvasReady()) return gm;
      await wait(150);
    }
    return null;
  }

  function refreshVideo() {
    [0, 120, 350, 800].forEach(delay => {
      window.setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        const canvas = document.querySelector('#game canvas');
        if (canvas) {
          canvas.style.visibility = 'hidden';
          void canvas.offsetHeight;
          canvas.style.visibility = '';
        }
      }, delay);
    });
  }

  async function restorePendingState() {
    if (!pendingState?.length || restoreRunning || restored) return restored;
    restoreRunning = true;
    setStatus('syncing', '☁️ Preparando save...');

    try {
      const gm = await waitForGameManager();
      if (!gm) throw new Error('Emulador ainda não ficou pronto para restaurar o estado.');

      for (let attempt = 0; attempt < RESTORE_DELAYS.length; attempt += 1) {
        await wait(RESTORE_DELAYS[attempt]);
        try {
          setStatus('syncing', `☁️ Restaurando${'.'.repeat(attempt + 1)}`);
          const result = gm.loadState(pendingState);
          if (result && typeof result.then === 'function') await result;
          restored = true;
          pendingState = null;
          refreshVideo();
          setStatus('synced', '☁️ Jogo restaurado');
          console.info('[RetroPlay Cloud 2.2] Estado restaurado após o jogo iniciar.');
          return true;
        } catch (error) {
          console.warn(`[RetroPlay Cloud 2.2] Tentativa ${attempt + 1} falhou.`, error);
          if (attempt === RESTORE_DELAYS.length - 1) throw error;
        }
      }
    } catch (error) {
      console.warn('Cloud Save não pôde ser restaurado:', error);
      setStatus('error', '☁️ Falha ao restaurar');
      return false;
    } finally {
      restoreRunning = false;
    }

    return false;
  }

  async function saveNow(force = false) {
    if (running || !gameId || restoreRunning) return false;
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
        type: 'auto-state',
        hash,
        size: bytes.length,
        device: navigator.userAgent,
        saved_at: new Date().toISOString(),
        cloud_version: '2.2'
      });
      lastHash = hash;
      setStatus('synced', `☁️ Salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
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
    restored = false;
    pendingState = null;

    const user = window.RetroPlayAuth?.getUser();
    if (!user) {
      setStatus('offline', '☁️ Save local — entre para sincronizar');
      return false;
    }

    setStatus('syncing', '☁️ Procurando save...');
    try {
      const row = await window.RetroPlayCloud.loadGameSave(gameId, SLOT);
      if (!row?.save_data) {
        setStatus('synced', '☁️ Nuvem ativa');
        return false;
      }

      pendingState = base64ToBytes(row.save_data);
      lastHash = row.metadata?.hash || fastHash(pendingState);
      setStatus('syncing', '☁️ Save encontrado');
      console.info(`[RetroPlay Cloud 2.2] Save encontrado (${pendingState.length} bytes).`);
      return true;
    } catch (error) {
      console.warn('Cloud Save não carregado:', error);
      setStatus('error', '☁️ Nuvem indisponível');
      return false;
    }
  }

  async function start() {
    if (timer) clearInterval(timer);

    if (pendingState?.length && !restored) {
      await restorePendingState();
    }

    timer = setInterval(() => saveNow(false), INTERVAL_MS);
    window.setTimeout(() => saveNow(false), 5000);
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

  window.RetroPlayAutoSave = {
    prepare,
    start,
    saveNow,
    stopAndSave,
    restorePendingState,
    wasRestored: () => restored,
    hasPendingState: () => Boolean(pendingState?.length)
  };
})();
