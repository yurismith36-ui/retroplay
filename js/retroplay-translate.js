(() => {
  "use strict";

  const button = document.querySelector("#translate-screen-button");
  const stage = document.querySelector("#emulator-stage");
  const titleElement = document.querySelector("#player-title");

  if (!button || !stage) return;

  const overlay = document.createElement("div");
  overlay.id = "translate-dialogue-overlay";
  overlay.className = "translate-dialogue-overlay";
  overlay.hidden = true;
  overlay.setAttribute("aria-live", "polite");
  overlay.innerHTML = `
    <p id="translate-dialogue-text" class="translate-dialogue-text"></p>
    <span class="translate-dialogue-badge">PT-BR</span>
  `;
  stage.appendChild(overlay);

  const overlayText = overlay.querySelector("#translate-dialogue-text");

  const toast = document.createElement("div");
  toast.className = "translate-toast";
  toast.hidden = true;
  document.body.appendChild(toast);

  let toastTimer = 0;
  let worker = null;
  let timer = 0;
  let busy = false;
  let enabled = false;
  let lastFingerprint = "";
  let lastRecognized = "";
  let currentCanvas = null;
  let profile = null;

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const normalize = value => String(value || "").trim().toLowerCase();

  function showToast(message, duration = 2300) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, duration);
  }

  function findGameCanvas() {
    const canvases = [...document.querySelectorAll("#game canvas")]
      .filter(canvas => canvas.width > 32 && canvas.height > 32);
    return canvases.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] || null;
  }

  function getGameTitle() {
    const params = new URLSearchParams(location.search);
    return (
      params.get("title") ||
      params.get("titulo") ||
      params.get("game") ||
      params.get("jogo") ||
      titleElement?.textContent ||
      ""
    ).trim();
  }

  function getLanguageHint() {
    const params = new URLSearchParams(location.search);
    return normalize(
      params.get("lang") ||
      params.get("language") ||
      params.get("idioma") ||
      document.documentElement.dataset.gameLanguage ||
      window.currentGame?.language ||
      window.currentGame?.idioma ||
      ""
    );
  }

  function isPortuguese(language) {
    const lang = normalize(language).replace("_", "-");
    return lang === "pt" || lang === "pt-br" || lang.startsWith("pt-");
  }

  function resolveProfile() {
    const profiles = window.RETROPLAY_TRANSLATE_PROFILES || {};
    const defaults = window.RETROPLAY_TRANSLATE_DEFAULTS || {};
    const title = normalize(getGameTitle());

    let selected = null;
    for (const [key, value] of Object.entries(profiles)) {
      if (title === normalize(key) || title.includes(normalize(key))) {
        selected = value;
        break;
      }
    }

    const languageHint = getLanguageHint();
    const merged = {
      ...defaults,
      ...(selected || {}),
      dialogue: {
        ...(defaults.dialogue || {}),
        ...((selected && selected.dialogue) || {})
      }
    };

    if (languageHint) merged.language = languageHint;

    // Sem perfil e sem idioma: não liga sozinho.
    if (!selected && !languageHint) merged.autoTranslate = false;
    if (isPortuguese(merged.language)) merged.autoTranslate = false;

    return merged;
  }

  function mappedCrop(canvas) {
    const region = profile.dialogue;
    const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(canvas.width * region.x)));
    const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(canvas.height * region.y)));
    const width = Math.max(1, Math.min(canvas.width - x, Math.floor(canvas.width * region.width)));
    const height = Math.max(1, Math.min(canvas.height - y, Math.floor(canvas.height * region.height)));
    return { x, y, width, height };
  }

  function positionOverlay() {
    const canvas = currentCanvas || findGameCanvas();
    if (!canvas || !profile) return;

    currentCanvas = canvas;
    const canvasRect = canvas.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const region = profile.dialogue;

    overlay.style.left = `${canvasRect.left - stageRect.left + canvasRect.width * region.x}px`;
    overlay.style.top = `${canvasRect.top - stageRect.top + canvasRect.height * region.y}px`;
    overlay.style.width = `${canvasRect.width * region.width}px`;
    overlay.style.height = `${canvasRect.height * region.height}px`;
  }

  function prepareDialogueImage(canvas) {
    const crop = mappedCrop(canvas);

    // Mantém o arquivo pequeno para não estourar memória no iPhone.
    const targetWidth = Math.min(1050, Math.max(620, crop.width * 4));
    const scale = targetWidth / crop.width;

    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(crop.width * scale));
    output.height = Math.max(1, Math.round(crop.height * scale));

    const ctx = output.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Não foi possível preparar a imagem.");

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      canvas,
      crop.x, crop.y, crop.width, crop.height,
      0, 0, output.width, output.height
    );

    const image = ctx.getImageData(0, 0, output.width, output.height);
    const data = image.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114);
      // Fonte clara vira branca e fundo escuro vira preto.
      const value = gray >= 145 ? 255 : gray <= 82 ? 0 : Math.round((gray - 82) * 4.05);
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }

    ctx.putImageData(image, 0, 0);
    return output;
  }

  function fingerprint(canvas) {
    const sample = document.createElement("canvas");
    sample.width = 32;
    sample.height = 12;
    const ctx = sample.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 0, 0, sample.width, sample.height);

    const data = ctx.getImageData(0, 0, sample.width, sample.height).data;
    let hash = 2166136261;

    for (let i = 0; i < data.length; i += 16) {
      const lum = (data[i] + data[i + 1] + data[i + 2]) >> 5;
      hash ^= lum;
      hash = Math.imul(hash, 16777619);
    }

    return String(hash >>> 0);
  }

  async function getWorker() {
    if (worker) return worker;
    if (!window.Tesseract) throw new Error("O leitor OCR não foi carregado.");

    showToast("Preparando tradução pela primeira vez...", 5000);

    worker = await Tesseract.createWorker("eng", 1, {
      logger(info) {
        if (info.status === "recognizing text" && enabled) {
          button.textContent = `🌐 LENDO ${Math.round((info.progress || 0) * 100)}%`;
        }
      }
    });

    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      preserve_interword_spaces: "1"
    });

    return worker;
  }

  function cleanOCR(text) {
    return String(text || "")
      .replace(/[|]{2,}/g, "I")
      .replace(/[_~^`]+/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{2,}/g, "\n")
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length >= 2)
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function looksUseful(text) {
    const letters = (text.match(/[A-Za-z]/g) || []).length;
    return text.length >= 5 && letters >= 4;
  }

  async function translateGoogle(text) {
    const url = "https://translate.googleapis.com/translate_a/single"
      + "?client=gtx&sl=auto&tl=pt-BR&dt=t&q=" + encodeURIComponent(text);

    const response = await fetch(url);
    if (!response.ok) throw new Error("Serviço de tradução indisponível.");

    const data = await response.json();
    const result = Array.isArray(data?.[0])
      ? data[0].map(part => part?.[0] || "").join("")
      : "";

    if (!result) throw new Error("A tradução retornou vazia.");
    return result;
  }

  async function translateFallback(text) {
    const url = "https://api.mymemory.translated.net/get?q="
      + encodeURIComponent(text.slice(0, 430))
      + "&langpair=en|pt-BR";

    const response = await fetch(url);
    if (!response.ok) throw new Error("Serviço alternativo indisponível.");

    const data = await response.json();
    const result = data?.responseData?.translatedText;
    if (!result) throw new Error("A tradução alternativa retornou vazia.");
    return result;
  }

  async function translateText(text) {
    try {
      return await translateGoogle(text);
    } catch (error) {
      console.warn("[RetroPlay Translate] Google falhou:", error);
      return translateFallback(text);
    }
  }

  function showTranslation(text) {
    overlayText.textContent = text;
    positionOverlay();
    overlay.hidden = false;
  }

  function clearTranslation() {
    overlay.hidden = true;
    overlayText.textContent = "";
  }

  async function scanDialogue(force = false) {
    if (!enabled || busy || document.hidden) return;

    const canvas = findGameCanvas();
    if (!canvas) return;
    currentCanvas = canvas;

    let prepared;
    try {
      prepared = prepareDialogueImage(canvas);
    } catch (error) {
      console.warn("[RetroPlay Translate] Captura indisponível:", error);
      return;
    }

    const currentFingerprint = fingerprint(prepared);
    if (!force && currentFingerprint === lastFingerprint) return;
    lastFingerprint = currentFingerprint;

    busy = true;

    try {
      const ocrWorker = await getWorker();
      const result = await ocrWorker.recognize(prepared);
      const recognized = cleanOCR(result?.data?.text);

      if (!looksUseful(recognized)) {
        clearTranslation();
        return;
      }

      if (!force && recognized === lastRecognized) return;
      lastRecognized = recognized;

      button.textContent = "🌐 TRADUZINDO...";
      const translated = await translateText(recognized);
      showTranslation(translated);
    } catch (error) {
      console.error("[RetroPlay Translate]", error);
      showToast(error?.message || "Não foi possível traduzir.");
    } finally {
      busy = false;
      updateButton();
    }
  }

  function updateButton() {
    button.classList.toggle("is-active", enabled);
    button.setAttribute("aria-pressed", String(enabled));
    button.textContent = enabled ? "🌐 AUTO: LIGADO" : "🌐 AUTO: DESLIGADO";
  }

  function startAutomatic(showMessage = true) {
    if (isPortuguese(profile.language)) {
      enabled = false;
      updateButton();
      if (showMessage) showToast("Este jogo está marcado como PT-BR.");
      return;
    }

    enabled = true;
    updateButton();
    clearInterval(timer);
    timer = setInterval(() => scanDialogue(false), Math.max(3000, profile.intervalMs || 4500));

    if (showMessage) showToast("Tradução automática ativada.");
    setTimeout(() => scanDialogue(true), 900);
  }

  function stopAutomatic(showMessage = true) {
    enabled = false;
    clearInterval(timer);
    timer = 0;
    clearTranslation();
    updateButton();
    if (showMessage) showToast("Tradução automática desligada.");
  }

  function toggleAutomatic() {
    if (enabled) stopAutomatic();
    else startAutomatic();
  }

  function initialize() {
    profile = resolveProfile();
    updateButton();

    const title = getGameTitle();
    console.info("[RetroPlay Translate] Perfil:", title, profile);

    if (profile.autoTranslate && !isPortuguese(profile.language)) {
      startAutomatic(false);
    }
  }

  button.addEventListener("click", toggleAutomatic);
  window.addEventListener("resize", positionOverlay);
  window.addEventListener("orientationchange", () => setTimeout(positionOverlay, 350));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && enabled) setTimeout(() => scanDialogue(true), 500);
  });

  // O título e o canvas são carregados depois do HTML em alguns emuladores.
  setTimeout(initialize, 1200);

  window.RetroPlayTranslate = {
    scanNow: () => scanDialogue(true),
    start: startAutomatic,
    stop: stopAutomatic,
    toggle: toggleAutomatic,
    getProfile: () => profile
  };
})();
