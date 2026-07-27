(() => {
  'use strict';

  const state = {
    busy: false,
    worker: null,
    overlay: null,
  };

  const $ = (selector) => document.querySelector(selector);

  function setStatus(message, progress = null) {
    const status = $('#translate-status');
    const bar = $('#translate-progress-bar');
    if (status) status.textContent = message;
    if (bar) {
      const value = typeof progress === 'number' ? Math.max(0, Math.min(1, progress)) : 0;
      bar.style.width = `${Math.round(value * 100)}%`;
      bar.parentElement.hidden = progress === null;
    }
  }

  function setText(original, translated) {
    const originalBox = $('#translate-original');
    const translatedBox = $('#translate-result');
    if (originalBox) originalBox.textContent = original || '—';
    if (translatedBox) translatedBox.textContent = translated || '—';
  }

  function openPanel() {
    $('#translate-panel')?.classList.add('open');
    $('#translate-panel')?.setAttribute('aria-hidden', 'false');
  }

  function closePanel() {
    $('#translate-panel')?.classList.remove('open');
    $('#translate-panel')?.setAttribute('aria-hidden', 'true');
  }

  function cleanText(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .replace(/[|]{2,}/g, 'I')
      .trim();
  }

  async function loadTesseract() {
    if (window.Tesseract?.createWorker) return;

    setStatus('Baixando o leitor de texto...', 0.02);
    await new Promise((resolve, reject) => {
      const old = document.querySelector('script[data-retroplay-tesseract]');
      if (old) {
        if (window.Tesseract?.createWorker) return resolve();
        old.addEventListener('load', resolve, { once: true });
        old.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.async = true;
      script.dataset.retroplayTesseract = 'true';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Não foi possível carregar o OCR.'));
      document.head.appendChild(script);
    });
  }

  async function getWorker() {
    if (state.worker) return state.worker;
    await loadTesseract();

    state.worker = await window.Tesseract.createWorker('eng', 1, {
      logger(message) {
        if (message.status === 'recognizing text') {
          setStatus('Reconhecendo o texto...', message.progress || 0);
        } else if (message.status) {
          setStatus('Preparando o OCR...', message.progress ?? 0.05);
        }
      },
    });

    await state.worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: '6',
    });

    return state.worker;
  }

  function findGameCanvas() {
    return [...document.querySelectorAll('#game canvas')]
      .filter(canvas => canvas.width > 0 && canvas.height > 0)
      .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] || null;
  }

  function canvasHasImage(canvas) {
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return false;
      const width = Math.max(1, Math.min(canvas.width, 64));
      const height = Math.max(1, Math.min(canvas.height, 64));
      const pixels = ctx.getImageData(0, 0, width, height).data;
      let total = 0;
      for (let i = 0; i < pixels.length; i += 4) total += pixels[i] + pixels[i + 1] + pixels[i + 2];
      return total > 100;
    } catch (_) {
      return false;
    }
  }

  function preprocess(source) {
    const maxWidth = 1600;
    const scale = Math.max(1, Math.min(4, maxWidth / source.width));
    const output = document.createElement('canvas');
    output.width = Math.round(source.width * scale);
    output.height = Math.round(source.height * scale);

    const ctx = output.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0, output.width, output.height);

    const image = ctx.getImageData(0, 0, output.width, output.height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const value = gray > 125 ? 255 : 0;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
    ctx.putImageData(image, 0, 0);
    return output;
  }

  async function captureViaScreenShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Este navegador não oferece captura de tela. Use Chrome ou Edge atualizado.');
    }

    setStatus('Escolha “Esta guia” ou a aba do RetroPlay...', 0.05);

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1 },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
    });

    try {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();

      await new Promise(resolve => {
        if (video.readyState >= 2 && video.videoWidth) return resolve();
        video.onloadedmetadata = () => resolve();
      });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const stage = $('#emulator-stage');
      if (!stage) throw new Error('Área do jogo não encontrada.');

      const rect = stage.getBoundingClientRect();
      const scaleX = video.videoWidth / window.innerWidth;
      const scaleY = video.videoHeight / window.innerHeight;

      let sx = Math.round(rect.left * scaleX);
      let sy = Math.round(rect.top * scaleY);
      let sw = Math.round(rect.width * scaleX);
      let sh = Math.round(rect.height * scaleY);

      // Limites seguros. Se o usuário compartilhou a tela inteira e não a aba,
      // a captura completa ainda será usada em vez de falhar.
      if (sx < 0 || sy < 0 || sx + sw > video.videoWidth || sy + sh > video.videoHeight || sw < 100 || sh < 100) {
        sx = 0;
        sy = 0;
        sw = video.videoWidth;
        sh = video.videoHeight;
      }

      const shot = document.createElement('canvas');
      shot.width = sw;
      shot.height = sh;
      const ctx = shot.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
      return shot;
    } finally {
      stream.getTracks().forEach(track => track.stop());
    }
  }

  async function captureGame() {
    // Primeiro tenta a captura leve do canvas, útil no PC/Android quando disponível.
    const canvas = findGameCanvas();
    if (canvas && canvasHasImage(canvas)) {
      const shot = document.createElement('canvas');
      shot.width = canvas.width;
      shot.height = canvas.height;
      shot.getContext('2d').drawImage(canvas, 0, 0);
      return shot;
    }

    // Caso WebGL não permita copiar o canvas, usa a captura oficial do navegador.
    return captureViaScreenShare();
  }

  async function translateOnline(text) {
    const limited = text.slice(0, 450);
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(limited)}&langpair=en|pt-BR`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Serviço de tradução respondeu ${response.status}.`);
    const data = await response.json();
    const result = data?.responseData?.translatedText;
    if (!result) throw new Error('O serviço não devolveu uma tradução.');
    return result;
  }

  function createOverlay() {
    if (state.overlay?.isConnected) return state.overlay;
    const overlay = document.createElement('div');
    overlay.id = 'retroplay-live-translation';
    Object.assign(overlay.style, {
      position: 'fixed',
      left: '50%',
      bottom: '9%',
      transform: 'translateX(-50%)',
      width: 'min(92vw, 900px)',
      boxSizing: 'border-box',
      zIndex: '2147483646',
      padding: '14px 18px',
      borderRadius: '8px',
      background: 'rgba(0,0,0,.94)',
      color: '#fff',
      fontFamily: 'Arial, sans-serif',
      fontSize: 'clamp(17px, 2.2vw, 26px)',
      fontWeight: '700',
      lineHeight: '1.35',
      textAlign: 'center',
      boxShadow: '0 8px 28px rgba(0,0,0,.5)',
      pointerEvents: 'none',
    });
    document.body.appendChild(overlay);
    state.overlay = overlay;
    return overlay;
  }

  function showOverlay(text) {
    const overlay = createOverlay();
    overlay.textContent = text;
    overlay.hidden = false;
    window.clearTimeout(showOverlay.timer);
    showOverlay.timer = window.setTimeout(() => { overlay.hidden = true; }, 15000);
  }

  async function translateCurrentScreen() {
    if (state.busy) return;
    state.busy = true;
    openPanel();
    setText('Aguardando captura...', '—');

    const button = $('#translate-screen-button');
    if (button) {
      button.disabled = true;
      button.textContent = 'CAPTURANDO...';
    }

    try {
      setStatus('Capturando a tela inteira do jogo...', 0.02);
      const raw = await captureGame();
      const snapshot = preprocess(raw);

      const worker = await getWorker();
      const result = await worker.recognize(snapshot);
      const text = cleanText(result?.data?.text);

      if (!text || text.length < 3) {
        setText('Nenhum texto reconhecido.', 'Tente novamente quando o diálogo estiver completamente visível.');
        setStatus('A captura funcionou, mas o OCR não encontrou texto.', null);
        return;
      }

      setText(text, 'Traduzindo...');
      setStatus('Enviando o texto para tradução...', 0.92);

      let translated;
      try {
        translated = await translateOnline(text);
      } catch (error) {
        console.warn('Tradução online falhou:', error);
        translated = `Falha na tradução online: ${error.message}`;
      }

      setText(text, translated);
      if (!translated.startsWith('Falha na tradução')) showOverlay(translated);
      setStatus('Tradução concluída.', null);
    } catch (error) {
      console.error('RetroPlay Capture Translate:', error);
      const message = error?.name === 'NotAllowedError'
        ? 'A captura foi cancelada. Toque em Traduzir novamente e escolha “Esta guia”.'
        : (error?.message || 'Não foi possível capturar a tela.');
      setText('Captura não concluída.', message);
      setStatus('Falha na captura.', null);
    } finally {
      state.busy = false;
      if (button) {
        button.disabled = false;
        button.textContent = '🌐 TRADUZIR';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#translate-screen-button')?.addEventListener('click', translateCurrentScreen);
    $('#translate-close')?.addEventListener('click', closePanel);
    $('#translate-panel')?.addEventListener('click', event => {
      if (event.target?.id === 'translate-panel') closePanel();
    });
  });

  window.addEventListener('pagehide', () => {
    try { state.worker?.terminate?.(); } catch (_) {}
    state.worker = null;
  });
})();
