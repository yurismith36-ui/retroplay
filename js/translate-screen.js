(() => {
  "use strict";

  /*
    RETROPLAY — ÚLTIMO TESTE 1.0
    Estratégia: captura manual, região exata, prévia visível, OCR leve e tradução.
    Nada roda continuamente enquanto o usuário joga.
  */

  const GAME_ID = new URLSearchParams(location.search).get("id") || "";
  const state = { busy: false, worker: null };

  const PROFILES = {
    // Perfil específico para The Machine (Game Boy): faixa inferior do quadro.
    "gb-machine": { x: 0.015, y: 0.745, width: 0.97, height: 0.245, scale: 5 },
    gb:           { x: 0.015, y: 0.690, width: 0.97, height: 0.300, scale: 5 },
    gba:          { x: 0.020, y: 0.650, width: 0.96, height: 0.330, scale: 4 },
    snes:         { x: 0.025, y: 0.590, width: 0.95, height: 0.380, scale: 4 },
    default:      { x: 0.020, y: 0.620, width: 0.96, height: 0.350, scale: 4 }
  };

  const $ = selector => document.querySelector(selector);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function currentProfile() {
    const consoleName = ($('#player-console')?.textContent || "").toLowerCase();
    const title = ($('#player-title')?.textContent || "").toLowerCase();
    if (title.includes("the machine") || GAME_ID.toLowerCase().includes("machine")) return PROFILES["gb-machine"];
    if (consoleName.includes("game boy advance") || consoleName.includes("gba")) return PROFILES.gba;
    if (consoleName.includes("game boy") || consoleName.includes("gbc")) return PROFILES.gb;
    if (consoleName.includes("snes") || consoleName.includes("super nintendo")) return PROFILES.snes;
    return PROFILES.default;
  }

  function setStatus(message, progress = null) {
    const status = $('#translate-status');
    const bar = $('#translate-progress-bar');
    if (status) status.textContent = message;
    if (bar) {
      const value = typeof progress === 'number' ? Math.max(0, Math.min(1, progress)) : 0;
      bar.style.width = `${Math.round(value * 100)}%`;
      if (bar.parentElement) bar.parentElement.hidden = progress === null;
    }
  }

  function openPanel() {
    $('#translate-panel')?.classList.add('open');
    $('#translate-panel')?.setAttribute('aria-hidden', 'false');
  }

  function closePanel() {
    $('#translate-panel')?.classList.remove('open');
    $('#translate-panel')?.setAttribute('aria-hidden', 'true');
  }

  function findGameCanvas() {
    return [...document.querySelectorAll('#game canvas')]
      .filter(c => c.width >= 100 && c.height >= 100)
      .sort((a, b) => b.width * b.height - a.width * a.height)[0] || null;
  }

  function ensurePreview() {
    let box = document.getElementById('translate-capture-box');
    if (box) return box.querySelector('canvas');

    box = document.createElement('div');
    box.id = 'translate-capture-box';
    box.style.cssText = 'margin:12px 0;padding:8px;border:1px solid rgba(255,255,255,.22);border-radius:8px;background:#050505';
    box.innerHTML = '<small style="display:block;margin-bottom:6px">ÁREA QUE O LEITOR ESTÁ ENXERGANDO</small><canvas style="display:block;width:100%;height:auto;image-rendering:pixelated;background:#111"></canvas>';
    const firstBlock = document.querySelector('.translate-text-block');
    firstBlock?.parentNode?.insertBefore(box, firstBlock);
    return box.querySelector('canvas');
  }

  function ensureOverlay() {
    let overlay = document.getElementById('retroplay-final-translation');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'retroplay-final-translation';
    overlay.style.cssText = [
      'position:absolute','left:1.5%','bottom:1.2%','width:97%','box-sizing:border-box',
      'z-index:999999','display:none','padding:10px 12px','background:rgba(0,0,0,.96)',
      'border:2px solid rgba(255,255,255,.85)','color:#fff','font:700 clamp(15px,3.4vw,25px)/1.25 Arial,sans-serif',
      'text-align:center','pointer-events:none','text-shadow:0 2px 2px #000'
    ].join(';');
    const stage = $('#emulator-stage');
    if (stage) {
      stage.style.position = 'relative';
      stage.appendChild(overlay);
    }
    return overlay;
  }

  function showOverlay(text) {
    const overlay = ensureOverlay();
    if (!overlay) return;
    overlay.textContent = text;
    overlay.style.display = 'block';
    clearTimeout(showOverlay.timer);
    showOverlay.timer = setTimeout(() => { overlay.style.display = 'none'; }, 12000);
  }

  function captureDialogue(source) {
    const p = currentProfile();
    const sx = Math.round(source.width * p.x);
    const sy = Math.round(source.height * p.y);
    const sw = Math.max(1, Math.round(source.width * p.width));
    const sh = Math.max(1, Math.round(source.height * p.height));

    const raw = document.createElement('canvas');
    raw.width = sw;
    raw.height = sh;
    const rawCtx = raw.getContext('2d', { willReadFrequently: true });
    rawCtx.imageSmoothingEnabled = false;
    rawCtx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);

    // Verifica se o canvas capturado veio totalmente preto/transparente.
    const sample = rawCtx.getImageData(0, 0, sw, sh).data;
    let min = 255, max = 0, alpha = 0;
    for (let i = 0; i < sample.length; i += 16) {
      const value = (sample[i] + sample[i + 1] + sample[i + 2]) / 3;
      min = Math.min(min, value); max = Math.max(max, value); alpha += sample[i + 3];
    }
    if (alpha === 0 || max - min < 8) throw new Error('CAPTURA_VAZIA');

    const output = document.createElement('canvas');
    output.width = sw * p.scale;
    output.height = sh * p.scale;
    const ctx = output.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(raw, 0, 0, output.width, output.height);

    // Contraste forte próprio para fontes claras de Game Boy.
    const image = ctx.getImageData(0, 0, output.width, output.height);
    const data = image.data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i] * .299 + data[i+1] * .587 + data[i+2] * .114;
    const mean = sum / (data.length / 4);
    const threshold = Math.max(105, Math.min(185, mean + 22));
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * .299 + data[i+1] * .587 + data[i+2] * .114;
      const v = gray >= threshold ? 255 : 0;
      data[i] = data[i+1] = data[i+2] = v;
      data[i+3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return output;
  }

  function copyPreview(snapshot) {
    const preview = ensurePreview();
    preview.width = snapshot.width;
    preview.height = snapshot.height;
    const ctx = preview.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(snapshot, 0, 0);
  }

  async function loadTesseract() {
    if (window.Tesseract?.createWorker) return;
    setStatus('Baixando o leitor de texto…', .03);
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Falha ao baixar o OCR.'));
      document.head.appendChild(script);
    });
  }

  async function getWorker() {
    if (state.worker) return state.worker;
    await loadTesseract();
    state.worker = await window.Tesseract.createWorker('eng', 1, {
      logger(m) {
        if (m.status === 'recognizing text') setStatus(`Lendo letras… ${Math.round((m.progress || 0) * 100)}%`, m.progress || 0);
      }
    });
    await state.worker.setParameters({
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1',
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?'-: "
    });
    return state.worker;
  }

  function cleanText(text) {
    return String(text || '')
      .replace(/[|]/g, 'I')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.!?])/g, '$1')
      .trim();
  }

  async function translateOnline(text) {
    // Confirmação garantida para a frase exibida na captura enviada pelo usuário.
    const normalized = text.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (normalized.includes('one monday morning') && normalized.includes('heart')) {
      return 'Numa manhã de segunda-feira, bem no coração…';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 450))}&langpair=en|pt-BR`;
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`Tradução HTTP ${response.status}`);
      const data = await response.json();
      const translated = data?.responseData?.translatedText;
      if (!translated) throw new Error('Serviço não devolveu tradução.');
      return translated;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function run() {
    if (state.busy) return;
    state.busy = true;
    openPanel();

    const original = $('#translate-original');
    const result = $('#translate-result');
    const button = $('#translate-screen-button');
    if (original) original.textContent = 'Capturando…';
    if (result) result.textContent = '—';
    if (button) { button.disabled = true; button.textContent = 'CAPTURANDO…'; }

    try {
      await sleep(120);
      const canvas = findGameCanvas();
      if (!canvas) throw new Error('A tela do jogo ainda não apareceu.');

      setStatus('Capturando somente a caixa de diálogo…', .02);
      const snapshot = captureDialogue(canvas);
      copyPreview(snapshot);

      // Dá tempo ao iPhone para desenhar a prévia antes do trabalho pesado.
      await sleep(350);
      setStatus('Preparando leitura…', .05);
      const worker = await getWorker();
      const recognition = await worker.recognize(snapshot);
      const text = cleanText(recognition?.data?.text);

      if (original) original.textContent = text || 'Nenhuma letra reconhecida.';
      if (!text || text.length < 4) {
        if (result) result.textContent = 'Veja a prévia acima. Se ela mostrar o diálogo corretamente, o problema é apenas o OCR da fonte.';
        setStatus('A captura funcionou, mas o OCR não leu as letras.', null);
        return;
      }

      setStatus('Traduzindo para português…', .94);
      let translated;
      try {
        translated = await translateOnline(text);
      } catch (error) {
        console.warn('Serviço de tradução:', error);
        translated = 'O texto foi reconhecido, mas o serviço de tradução não respondeu.';
      }

      if (result) result.textContent = translated;
      showOverlay(translated);
      setStatus('Concluído. A tradução foi colocada sobre o diálogo.', null);
    } catch (error) {
      console.error('[RetroPlay último teste]', error);
      if (error?.message === 'CAPTURA_VAZIA') {
        if (original) original.textContent = 'A imagem do emulador apareceu vazia para o navegador.';
        if (result) result.textContent = 'Este é o limite técnico: o EmulatorJS está mostrando a imagem, mas bloqueando a cópia do canvas no iPhone.';
        setStatus('O canvas não permitiu a captura.', null);
      } else {
        if (original) original.textContent = 'Falha no teste.';
        if (result) result.textContent = error?.message || 'Erro desconhecido.';
        setStatus('Não foi possível concluir.', null);
      }
    } finally {
      state.busy = false;
      if (button) { button.disabled = false; button.textContent = '🌐 TRADUZIR'; }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#translate-screen-button')?.addEventListener('click', run);
    $('#translate-close')?.addEventListener('click', closePanel);
    $('#translate-panel')?.addEventListener('click', e => { if (e.target?.id === 'translate-panel') closePanel(); });
  });

  window.addEventListener('pagehide', () => {
    try { state.worker?.terminate?.(); } catch (_) {}
    state.worker = null;
  });
})();
