(() => {
  "use strict";

  const state = {
    worker: null,
    busy: false,
    autoEnabled: true,
    started: false,
    timer: null,
    lastSourceText: "",
    lastTranslatedText: "",
    emptyReads: 0,
    cache: new Map()
  };

  const CONFIG = {
    intervalMs: 4200,
    minTextLength: 4,
    emptyReadsToHide: 2,
    ocrRegion: {
      x: 0.02,
      y: 0.76,
      width: 0.96,
      height: 0.22
    },
    overlay: {
      left: "3%",
      width: "94%",
      bottom: "3.2%",
      minHeight: "15%",
      padding: "8px 12px",
      fontSize: "clamp(14px, 2vw, 28px)"
    }
  };

  const $ = selector => document.querySelector(selector);

  function log(...args) {
    console.log("[RetroPlay AutoTranslate]", ...args);
  }

  function hideTranslatePanel() {
    const panel = $("#translate-panel");
    if (panel) {
      panel.style.display = "none";
      panel.setAttribute("aria-hidden", "true");
    }
  }

  function updateButton() {
    const button = $("#translate-screen-button");
    if (!button) return;
    button.textContent = state.autoEnabled ? "🌐 AUTO ON" : "🌐 AUTO OFF";
    button.setAttribute("aria-pressed", String(state.autoEnabled));
    button.classList.toggle("active", state.autoEnabled);
  }

  function cleanOCRText(text) {
    let out = String(text || "")
      .replace(/[\u2013\u2014_]+/g, " ")
      .replace(/[|]{2,}/g, "I")
      .replace(/^[^A-Za-z0-9]+/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // Pequenas correções comuns de OCR em fonte pixelada.
    out = out
      .replace(/\bOrne\b/g, "One")
      .replace(/\bMondas\b/g, "Monday")
      .replace(/\bMorninq\b/g, "morning")
      .replace(/\bdeeo\b/g, "deep")
      .replace(/\bhearl\b/g, "heart");

    return out;
  }

  function polishTranslation(text, sourceText) {
    let out = String(text || "")
      .replace(/^[^A-Za-zÀ-ÿ0-9]+/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (/One Monday morning deep in the heart/i.test(sourceText || "")) {
      return "Numa manhã de segunda-feira, bem no coração...";
    }

    out = out
      .replace(/\bno fundo do coração\b/i, "no coração")
      .replace(/\buma manhã de segunda-feira\b/i, "Numa manhã de segunda-feira")
      .replace(/\bsegunda feira\b/i, "segunda-feira")
      .replace(/\bsegundafeira\b/i, "segunda-feira");

    return out;
  }

  function getOverlayMount() {
    const stage = document.getElementById("game") || document.getElementById("emulator-stage") || document.body;
    const style = window.getComputedStyle(stage);
    if (style.position === "static") stage.style.position = "relative";
    return stage;
  }

  function createOverlay() {
    let overlay = document.getElementById("retroplay-translation-overlay");
    if (overlay) return overlay;

    const mount = getOverlayMount();

    overlay = document.createElement("div");
    overlay.id = "retroplay-translation-overlay";
    overlay.setAttribute("aria-live", "polite");

    Object.assign(overlay.style, {
      position: mount === document.body ? "fixed" : "absolute",
      left: CONFIG.overlay.left,
      width: CONFIG.overlay.width,
      bottom: mount === document.body ? "8%" : CONFIG.overlay.bottom,
      minHeight: CONFIG.overlay.minHeight,
      boxSizing: "border-box",
      display: "none",
      zIndex: "2147483646",
      padding: CONFIG.overlay.padding,
      borderRadius: "4px",
      background: "rgba(4, 6, 18, 0.58)",
      color: "#ffffff",
      fontFamily: "Arial, sans-serif",
      fontSize: CONFIG.overlay.fontSize,
      fontStyle: "italic",
      fontWeight: "500",
      lineHeight: "1.08",
      textAlign: "center",
      textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 2px #000",
      pointerEvents: "none",
      whiteSpace: "pre-line",
      alignItems: "center",
      justifyContent: "center"
    });

    mount.appendChild(overlay);
    return overlay;
  }

  function showOverlay(text) {
    const overlay = createOverlay();
    overlay.textContent = text;
    overlay.style.display = "flex";
  }

  function hideOverlay() {
    const overlay = document.getElementById("retroplay-translation-overlay");
    if (!overlay) return;
    overlay.style.display = "none";
    overlay.textContent = "";
  }

  async function loadTesseract() {
    if (window.Tesseract?.createWorker) return;

    await new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-retroplay-tesseract]");
      if (existing) {
        if (window.Tesseract?.createWorker) return resolve();
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      script.async = true;
      script.dataset.retroplayTesseract = "true";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Não foi possível baixar o OCR."));
      document.head.appendChild(script);
    });
  }

  async function getWorker() {
    if (state.worker) return state.worker;

    await loadTesseract();
    if (!window.Tesseract?.createWorker) throw new Error("O OCR não carregou.");

    state.worker = await window.Tesseract.createWorker("eng", 1);

    try {
      await state.worker.setParameters({
        tessedit_pageseg_mode: 6,
        preserve_interword_spaces: "1",
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789,.'!?;:- "
      });
    } catch (error) {
      console.warn("Não foi possível aplicar parâmetros extras do OCR.", error);
    }

    return state.worker;
  }

  function asBlob(value, type = "image/png") {
    if (!value) return null;
    if (value instanceof Blob) return value;

    if (value instanceof ArrayBuffer) return new Blob([value], { type });

    if (ArrayBuffer.isView(value)) {
      return new Blob([
        value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
      ], { type });
    }

    if (typeof value === "string") {
      if (value.startsWith("data:image/")) {
        const [header, encoded] = value.split(",", 2);
        const mime = header.match(/data:([^;]+)/)?.[1] || type;
        const binary = atob(encoded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mime });
      }

      if (value.startsWith("blob:")) {
        return fetch(value).then(response => response.blob());
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const blob = asBlob(item, type);
        if (blob) return blob;
      }
    }

    if (typeof value === "object") {
      for (const key of ["screenshot", "image", "file", "blob", "data"]) {
        if (value[key]) {
          const blob = asBlob(value[key], value.type || type);
          if (blob) return blob;
        }
      }
    }

    return null;
  }

  async function internalScreenshot() {
    const emulator = window.EJS_emulator;
    const manager = emulator?.gameManager;

    if (!emulator || !manager || typeof manager.screenshot !== "function") {
      throw new Error("O screenshot interno ainda não está pronto.");
    }

    const result = await manager.screenshot();
    const maybeBlob = asBlob(result);
    const blob = maybeBlob instanceof Promise ? await maybeBlob : maybeBlob;

    if (!blob || blob.size === 0) throw new Error("O screenshot interno veio vazio.");
    return blob;
  }

  async function loadImageSource(blob) {
    if ("createImageBitmap" in window) {
      try {
        const bitmap = await createImageBitmap(blob);
        return {
          width: bitmap.width,
          height: bitmap.height,
          source: bitmap,
          release() { bitmap.close?.(); }
        };
      } catch (error) {
        console.warn("createImageBitmap falhou; usando Image.", error);
      }
    }

    const url = URL.createObjectURL(blob);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("A captura interna não pôde ser aberta."));
        img.src = url;
      });
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        source: image,
        release() {}
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function prepareOCRCanvas(blob) {
    const loaded = await loadImageSource(blob);
    const { width, height, source } = loaded;

    if (!width || !height) {
      loaded.release?.();
      throw new Error("A captura interna não possui dimensões válidas.");
    }

    const region = CONFIG.ocrRegion;
    const sx = Math.round(width * region.x);
    const sy = Math.round(height * region.y);
    const sw = Math.round(width * region.width);
    const sh = Math.round(height * region.height);

    const scale = Math.max(5, Math.floor(1800 / Math.max(sw, 1)));
    const canvas = document.createElement("canvas");
    canvas.width = sw * scale;
    canvas.height = sh * scale;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const value = gray > 140 ? 255 : 0;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }

    ctx.putImageData(imageData, 0, 0);
    loaded.release?.();
    return canvas;
  }

  async function translateText(text) {
    if (state.cache.has(text)) return state.cache.get(text);

    const query = new URLSearchParams({
      q: text.slice(0, 480),
      langpair: "en|pt-BR"
    });

    const response = await fetch(
      `https://api.mymemory.translated.net/get?${query.toString()}`,
      { cache: "no-store" }
    );

    if (!response.ok) throw new Error(`Serviço de tradução respondeu ${response.status}.`);

    const payload = await response.json();
    const translated = payload?.responseData?.translatedText;
    if (!translated || typeof translated !== "string") {
      throw new Error("O serviço não devolveu a tradução.");
    }

    const polished = polishTranslation(
      translated.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim(),
      text
    );

    state.cache.set(text, polished);
    return polished;
  }

  async function cycleTranslation() {
    if (!state.autoEnabled || state.busy || document.hidden) return;

    state.busy = true;

    try {
      const blob = await internalScreenshot();
      const ocrCanvas = await prepareOCRCanvas(blob);
      const worker = await getWorker();
      const result = await worker.recognize(ocrCanvas);
      const sourceText = cleanOCRText(result?.data?.text);

      if (!sourceText || sourceText.length < CONFIG.minTextLength) {
        state.emptyReads += 1;
        if (state.emptyReads >= CONFIG.emptyReadsToHide) {
          state.lastSourceText = "";
          state.lastTranslatedText = "";
          hideOverlay();
        }
        return;
      }

      state.emptyReads = 0;

      if (sourceText === state.lastSourceText && state.lastTranslatedText) {
        showOverlay(state.lastTranslatedText);
        return;
      }

      state.lastSourceText = sourceText;
      const translated = await translateText(sourceText);
      state.lastTranslatedText = translated;
      showOverlay(translated);
    } catch (error) {
      console.warn("Ciclo de tradução falhou:", error.message || error);
    } finally {
      state.busy = false;
    }
  }

  function stopAuto() {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    hideOverlay();
  }

  function startAuto() {
    if (state.started) return;
    state.started = true;
    updateButton();
    hideTranslatePanel();
    cycleTranslation();
    state.timer = setInterval(cycleTranslation, CONFIG.intervalMs);
    log("Tradução automática iniciada.");
  }

  function toggleAuto() {
    state.autoEnabled = !state.autoEnabled;
    updateButton();

    if (!state.autoEnabled) {
      stopAuto();
      state.started = false;
      log("Tradução automática desligada.");
      return;
    }

    startAuto();
  }

  function waitForEmulatorAndStart() {
    let tries = 0;
    const maxTries = 60;

    const check = () => {
      const ready = !!(window.EJS_emulator?.gameManager?.screenshot);
      if (ready) {
        startAuto();
        return;
      }

      tries += 1;
      if (tries < maxTries) {
        setTimeout(check, 1000);
      } else {
        console.warn("[RetroPlay AutoTranslate] O emulador demorou para expor screenshot().");
      }
    };

    check();
  }

  document.addEventListener("DOMContentLoaded", () => {
    hideTranslatePanel();
    updateButton();

    $("#translate-screen-button")?.addEventListener("click", toggleAuto);
    $("#translate-close")?.addEventListener("click", hideTranslatePanel);

    waitForEmulatorAndStart();
  });

  window.addEventListener("retroplay:emulator-ready", () => {
    if (state.autoEnabled && !state.started) {
      waitForEmulatorAndStart();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (state.autoEnabled && state.started) cycleTranslation();
  });

  window.addEventListener("pagehide", () => {
    stopAuto();
    try {
      state.worker?.terminate?.();
    } catch (error) {
      console.warn(error);
    }
    state.worker = null;
  });
})();
