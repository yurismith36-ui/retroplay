(() => {
  'use strict';

  const state = {
    worker: null,
    busy: false,
    initialized: false,
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

  function cleanText(text) {
    return String(text || '')
      .replace(/[|]{2,}/g, 'I')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Pequeno glossário apenas para dar contexto no primeiro teste com Pokémon.
  // A tradução completa será adicionada depois que confirmarmos que o OCR lê a tela corretamente.
  function previewTranslation(text) {
    const replacements = [
      [/\bwelcome\b/gi, 'bem-vindo'],
      [/\bworld\b/gi, 'mundo'],
      [/\bpok[eé]mon\b/gi, 'Pokémon'],
      [/\btrainer\b/gi, 'treinador'],
      [/\bprofessor\b/gi, 'professor'],
      [/\bhello\b/gi, 'olá'],
      [/\byes\b/gi, 'sim'],
      [/\bno\b/gi, 'não'],
      [/\bsave\b/gi, 'salvar'],
      [/\bgame\b/gi, 'jogo'],
      [/\bcontinue\b/gi, 'continuar'],
      [/\bnew\b/gi, 'novo'],
      [/\bstart\b/gi, 'iniciar'],
      [/\bchoose\b/gi, 'escolha'],
      [/\bname\b/gi, 'nome'],
      [/\bfriend\b/gi, 'amigo'],
      [/\bpeople\b/gi, 'pessoas'],
      [/\bbattle\b/gi, 'batalha'],
      [/\battack\b/gi, 'ataque'],
    ];

    let translated = text;
    replacements.forEach(([pattern, value]) => {
      translated = translated.replace(pattern, value);
    });
    return translated;
  }

  function findGameCanvas() {
    const canvases = [...document.querySelectorAll('#game canvas')]
      .filter(canvas => canvas.width > 0 && canvas.height > 0)
      .sort((a, b) => (b.width * b.height) - (a.width * a.height));
    return canvases[0] || null;
  }

  function makeReadableSnapshot(source) {
    const maxWidth = 1280;
    const scale = Math.max(1, Math.min(4, maxWidth / source.width));
    const output = document.createElement('canvas');
    output.width = Math.round(source.width * scale);
    output.height = Math.round(source.height * scale);
    const context = output.getContext('2d', { willReadFrequently: true });
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, output.width, output.height);

    // Aumenta contraste para ajudar em textos pixelados.
    const image = context.getImageData(0, 0, output.width, output.height);
    const data = image.data;
    for (let index = 0; index < data.length; index += 4) {
      const gray = (data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114);
      const value = gray > 145 ? 255 : 0;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
    }
    context.putImageData(image, 0, 0);
    return output;
  }

  async function loadTesseractOnDemand() {
    if (window.Tesseract?.createWorker) return;

    setStatus('Baixando o leitor de texto pela primeira vez...', 0.02);
    await new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-retroplay-tesseract]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.async = true;
      script.dataset.retroplayTesseract = 'true';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Não foi possível baixar o leitor de texto.'));
      document.head.appendChild(script);
    });
  }

  async function getWorker() {
    if (state.worker) return state.worker;
    await loadTesseractOnDemand();

    if (!window.Tesseract?.createWorker) {
      throw new Error('O leitor de texto não carregou. Verifique a internet e tente novamente.');
    }

    setStatus('Preparando o leitor de texto...', 0.05);
    state.worker = await window.Tesseract.createWorker('eng', 1, {
      logger(message) {
        if (message.status === 'recognizing text') {
          setStatus('Lendo o texto da tela...', message.progress || 0);
        } else if (message.status) {
          setStatus('Preparando o leitor...', message.progress ?? 0.05);
        }
      },
    });
    state.initialized = true;
    return state.worker;
  }

  function openPanel() {
    $('#translate-panel')?.classList.add('open');
    $('#translate-panel')?.setAttribute('aria-hidden', 'false');
  }

  function closePanel() {
    $('#translate-panel')?.classList.remove('open');
    $('#translate-panel')?.setAttribute('aria-hidden', 'true');
  }

  async function translateCurrentScreen() {
    if (state.busy) return;
    openPanel();

    const original = $('#translate-original');
    const translated = $('#translate-result');
    if (original) original.textContent = 'Aguardando leitura...';
    if (translated) translated.textContent = '—';

    const canvas = findGameCanvas();
    if (!canvas) {
      setStatus('Inicie o jogo e espere a imagem aparecer antes de traduzir.');
      return;
    }

    state.busy = true;
    const button = $('#translate-screen-button');
    if (button) {
      button.disabled = true;
      button.textContent = 'LENDO...';
    }

    try {
      setStatus('Capturando a tela do jogo...', 0.02);
      const snapshot = makeReadableSnapshot(canvas);
      const worker = await getWorker();
      const result = await worker.recognize(snapshot);
      const text = cleanText(result?.data?.text);

      if (!text || text.length < 2) {
        if (original) original.textContent = 'Nenhum texto foi reconhecido nesta tela.';
        if (translated) translated.textContent = 'Tente quando aparecer uma caixa de diálogo grande e bem visível.';
        setStatus('Leitura concluída.', null);
        return;
      }

      if (original) original.textContent = text;
      if (translated) translated.textContent = previewTranslation(text);
      setStatus('Leitura concluída. Esta versão testa o OCR; a tradução completa vem depois.', null);
    } catch (error) {
      console.error('RetroPlay Translate:', error);
      if (original) original.textContent = 'Não foi possível capturar ou ler esta tela.';
      if (translated) translated.textContent = error?.message || 'Tente novamente.';
      setStatus('Falha na leitura.', null);
    } finally {
      state.busy = false;
      if (button) {
        button.disabled = false;
        button.textContent = '🌐 TRADUZIR TELA';
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
    try { state.worker?.terminate?.(); } catch (error) {}
    state.worker = null;
  });
})();
