// RetroPlay Cloud 3.1 — restauração segura e autosave protegido
(() => {
  const SLOT = 10;
  const START_GRACE_MS = 15000;
  const RESTORE_WAIT_MS = 3000;
  const SNES_INTERVAL_MS = 20000;
  const MIN_STATE_BYTES = 1024;

  let gameId = null;
  let isN64 = false;
  let timer = null;
  let uploadRunning = false;
  let restoreRunning = false;
  let playerStarted = false;
  let emulatorReady = false;
  let autosaveEnabled = false;
  let pendingState = null;
  let pendingHash = '';
  let lastHash = '';
  let startToken = 0;

  const statusEl = () => document.querySelector('#cloud-save-status');
  const loadButton = () => document.querySelector('#cloud-load-save');
  const ignoreButton = () => document.querySelector('#cloud-ignore-save');

  function log(message, extra) {
    if (typeof extra === 'undefined') console.info(`[RetroPlay Cloud 3.1] ${message}`);
    else console.info(`[RetroPlay Cloud 3.1] ${message}`, extra);
  }

  function setStatus(kind, text) {
    const el = statusEl();
    if (!el) return;
    el.className = `cloud-save-status ${kind}`;
    el.textContent = text;
  }

  function showSaveChoices(show) {
    [loadButton(), ignoreButton()].forEach(button => {
      if (button) button.hidden = !show;
    });
  }

  function disableSaveChoices(disabled) {
    [loadButton(), ignoreButton()].forEach(button => {
      if (button) button.disabled = disabled;
    });
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
    try {
      const state = gm.getState();
      if (!state) return null;
      const bytes = state instanceof Uint8Array ? state : new Uint8Array(state);
      return bytes.length >= MIN_STATE_BYTES ? bytes : null;
    } catch (error) {
      console.warn('[RetroPlay Cloud 3.1] Não foi possível capturar o estado.', error);
      return null;
    }
  }

  function canvasReady() {
    const canvas = document.querySelector('#game canvas');
    return Boolean(canvas && canvas.width > 0 && canvas.height > 0);
  }

  async function waitForManager(timeoutMs = 15000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const gm = getGameManager();
      if (gm && typeof gm.getState === 'function' && typeof gm.loadState === 'function' && canvasReady()) {
        return gm;
      }
      await wait(200);
    }
    return null;
  }

  function stopTimer() {
    if (timer) window.clearInterval(timer);
    timer = null;
  }

  function startTimer() {
    stopTimer();
    if (!autosaveEnabled || !emulatorReady || pendingState || restoreRunning) return;
    if (isN64) {
      log('N64 Safe Mode: autosave periódico desativado.');
      return;
    }
    const interval = SNES_INTERVAL_MS;
    timer = window.setInterval(() => saveNow(false), interval);
    log(`Autosave iniciado a cada ${Math.round(interval / 1000)} segundos.`);
  }

  async function enableAutosaveAfterGrace(token = startToken) {
    setStatus('syncing', '☁️ Estabilizando jogo...');
    await wait(START_GRACE_MS);
    if (token !== startToken || !playerStarted || pendingState || restoreRunning) return false;

    const gm = await waitForManager(5000);
    if (!gm) {
      setStatus('error', '☁️ Jogo não ficou pronto');
      log('Autosave bloqueado: emulador não ficou pronto.');
      return false;
    }

    emulatorReady = true;
    autosaveEnabled = true;
    setStatus('synced', isN64 ? '☁️ N64 modo seguro' : '☁️ Nuvem ativa');
    startTimer();
    return true;
  }

  async function saveNow(force = false) {
    if (!gameId || uploadRunning || restoreRunning || pendingState) return false;
    if (!playerStarted || !emulatorReady || !autosaveEnabled) return false;
    if (isN64 && !force) {
      log('N64 Safe Mode: salvamento automático ignorado.');
      return false;
    }

    const user = window.RetroPlayAuth?.getUser();
    if (!user) {
      setStatus('offline', '☁️ Entre para usar a nuvem');
      return false;
    }

    const bytes = getStateBytes();
    if (!bytes) {
      log('Salvamento ignorado: estado vazio ou emulador ainda não pronto.');
      return false;
    }

    const hash = fastHash(bytes);
    if (!force && hash === lastHash) return true;

    uploadRunning = true;
    setStatus('syncing', '☁️ Salvando...');
    try {
      await window.RetroPlayCloud.saveGame(gameId, SLOT, bytesToBase64(bytes), {
        type: 'auto-state',
        hash,
        size: bytes.length,
        device: navigator.userAgent,
        saved_at: new Date().toISOString(),
        cloud_version: '3.1',
        save_mode: isN64 ? 'n64-exit-only' : 'safe-periodic'
      });
      lastHash = hash;
      setStatus('synced', `☁️ Salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
      return true;
    } catch (error) {
      console.warn('[RetroPlay Cloud 3.1] Falha ao enviar save.', error);
      setStatus('error', navigator.onLine ? '☁️ Erro ao salvar' : '☁️ Sem internet');
      return false;
    } finally {
      uploadRunning = false;
    }
  }

  async function prepare(game) {
    stopTimer();
    startToken += 1;
    gameId = game.id;
    isN64 = String(game.core || '').toLowerCase() === 'n64'
      || String(game.console || '').toLowerCase().includes('nintendo 64');
    uploadRunning = false;
    restoreRunning = false;
    playerStarted = false;
    emulatorReady = false;
    autosaveEnabled = false;
    pendingState = null;
    pendingHash = '';
    lastHash = '';
    showSaveChoices(false);
    disableSaveChoices(false);

    const user = window.RetroPlayAuth?.getUser();
    if (!user) {
      setStatus('offline', '☁️ Save local — entre para sincronizar');
      return false;
    }

    setStatus('syncing', '☁️ Procurando save...');
    try {
      const row = await window.RetroPlayCloud.loadGameSave(gameId, SLOT);
      if (!row?.save_data) {
        setStatus('syncing', '☁️ Nuvem pronta');
        return false;
      }

      const bytes = base64ToBytes(row.save_data);
      if (bytes.length < MIN_STATE_BYTES) throw new Error('Save recebido é pequeno demais.');

      pendingState = bytes;
      pendingHash = row.metadata?.hash || fastHash(bytes);
      lastHash = pendingHash;
      setStatus('syncing', '☁️ Save encontrado — escolha abaixo');
      log(`Save encontrado (${bytes.length} bytes). A restauração automática foi desativada por segurança.`);
      return true;
    } catch (error) {
      console.warn('[RetroPlay Cloud 3.1] Save não carregado.', error);
      setStatus('error', '☁️ Nuvem indisponível');
      return false;
    }
  }

  async function start() {
    if (playerStarted) return;
    playerStarted = true;
    const token = ++startToken;
    log('Evento de início do jogo recebido.');

    if (pendingState?.length) {
      setStatus('syncing', '☁️ Save disponível');
      showSaveChoices(true);
      return;
    }

    await enableAutosaveAfterGrace(token);
  }

  async function restorePendingState() {
    if (!pendingState?.length || restoreRunning || !playerStarted) return false;
    restoreRunning = true;
    autosaveEnabled = false;
    stopTimer();
    disableSaveChoices(true);
    setStatus('syncing', '☁️ Preparando restauração...');

    try {
      const gm = await waitForManager();
      if (!gm) throw new Error('Emulador não ficou pronto para restaurar.');

      await wait(RESTORE_WAIT_MS);
      setStatus('syncing', '☁️ Restaurando save...');
      const result = gm.loadState(pendingState);
      if (result && typeof result.then === 'function') await result;

      pendingState = null;
      pendingHash = '';
      showSaveChoices(false);
      setStatus('synced', isN64 ? '☁️ N64 restaurado — modo seguro' : '☁️ Jogo restaurado');
      log('Save restaurado uma única vez.');

      await wait(START_GRACE_MS);
      emulatorReady = true;
      autosaveEnabled = true;
      startTimer();
      return true;
    } catch (error) {
      console.warn('[RetroPlay Cloud 3.1] Falha ao restaurar.', error);
      setStatus('error', '☁️ Save não restaurado');
      disableSaveChoices(false);
      showSaveChoices(true);
      return false;
    } finally {
      restoreRunning = false;
    }
  }

  async function ignorePendingState() {
    if (!pendingState?.length || restoreRunning) return false;
    const confirmed = window.confirm('Jogar sem carregar o save da nuvem? Um novo progresso poderá substituir esse save depois.');
    if (!confirmed) return false;

    pendingState = null;
    pendingHash = '';
    lastHash = '';
    showSaveChoices(false);
    setStatus('syncing', isN64 ? '☁️ N64 sem save — modo seguro' : '☁️ Iniciando save novo...');
    log('Usuário escolheu jogar sem restaurar o save existente.');
    await enableAutosaveAfterGrace(++startToken);
    return true;
  }

  async function stopAndSave() {
    stopTimer();
    if (!autosaveEnabled || !emulatorReady || pendingState || restoreRunning) {
      log('Save ao sair ignorado por segurança.');
      return false;
    }
    return saveNow(true);
  }

  document.addEventListener('click', event => {
    if (event.target?.id === 'cloud-load-save') restorePendingState();
    if (event.target?.id === 'cloud-ignore-save') ignorePendingState();
  });

  document.addEventListener('visibilitychange', () => {
    // N64: não captura estado ao colocar o navegador em segundo plano,
    // porque essa captura pode congelar o núcleo em celulares.
    if (document.visibilityState === 'hidden' && !isN64) stopAndSave();
  });
  window.addEventListener('pagehide', () => {
    if (!isN64) stopAndSave();
  });

  window.RetroPlayAutoSave = {
    prepare,
    start,
    saveNow,
    stopAndSave,
    restorePendingState,
    ignorePendingState,
    hasPendingState: () => Boolean(pendingState?.length),
    isReady: () => emulatorReady && autosaveEnabled
  };
})();
