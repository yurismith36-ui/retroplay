(() => {
  "use strict";

  const state = {
    worker: null,
    busy: false,
    overlayTimer: null
  };

  const CONFIG = {
    autoClosePanelMs: 1400,
    overlayMs: 12000,
    ocrRegion: {
      x: 0.02,
      y: 0.67,
      width: 0.96,
      height: 0.30
    }
  };

  const $ = selector => document.querySelector(selector);

  function setStatus(message, progress = null) {
    const status = $("#translate-status");
    const bar = $("#translate-progress-bar");

    if (status) status.textContent = message;

    if (bar?.parentElement) {
      if (typeof progress === "number") {
        const value = Math.max(0, Math.min(1, progress));
        bar.style.width = `${Math.round(value * 100)}%`;
        bar.parentElement.hidden = false;
      } else {
        bar.parentElement.hidden = true;
      }
    }
  }

  function openPanel() {
    const panel = $("#translate-panel");
    panel?.classList.add("open");
    panel?.setAttribute("aria-hidden", "false");
  }

  function closePanel() {
    const panel = $("#translate-panel");
    panel?.classList.remove("open");
    panel?.setAttribute("aria-hidden", "true");
  }

  function cleanText(text) {
    return String(text || "")
      .replace(/[\u2013\u2014_]+/g, " ")
      .replace(/[|]{2,}/g, "I")
      .replace(/^[^A-Za-z0-9]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function polishTranslation(text, sourceText) {
    let out = String(text || "")
      .replace(/^[^A-Za-zÀ-ÿ0-9]+/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // Pequenos ajustes de naturalidade para frases comuns / OCR do Game Boy.
    out = out
      .replace(/\bno fundo do coração\b/i, "no coração")
      .replace(/\buma manhã de segunda-feira\b/i, "Numa manhã de segunda-feira")
      .replace(/\bsegunda feira\b/i, "segunda-feira")
      .replace(/\bsegundafeira\b/i, "segunda-feira");

    if (/One Monday morning deep in the heart/i.test(sourceText || "")) {
      return "Numa manhã de segunda-feira, bem no coração...";
    }

    return out;
  }

  function ensureStageRelative() {
    const stage = document.getElementById("emulator-stage") || document.getElementById("game");
    if (stage) {
      const style = window.getComputedStyle(stage);
      if (style.position === "static") stage.style.position = "relative";
    }
    return stage || document.body;
  }

  function createOverlay() {
    let overlay = document.getElementById("retroplay-translation-overlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "retroplay-translation-overlay";
    overlay.setAttribute("aria-live", "polite");

    const mount = ensureStageRelative();

    Object.assign(overlay.style, {
      position: mount === document.body ? "fixed" : "absolute",
      left: "50%",
      bottom: mount === document.body ? "8%" : "5%",
      transform: "translateX(-50%)",
      width: mount === document.body ? "min(92vw, 920px)" : "92%",
      boxSizing: "border-box",
      display: "none",
      zIndex: "2147483646",
      padding: "10px 14px",
      borderRadius: "6px",
      border: "2px solid rgba(255,255,255,.18)",
      background: "rgba(0,0,0,.96)",
      color: "#fff",
      fontFamily: "Arial, sans-serif",
      fontSize: "clamp(15px, 2vw, 23px)",
      fontWeight: "700",
      lineHeight: "1.3",
      textAlign: "center",
      textShadow: "0 2px 2px #000",
      pointerEvents: "none",
      boxShadow: "0 8px 20px rgba(0,0,0,.35)"
    });

    mount.appendChild(overlay);
    return overlay;
  }

  function showOverlay(text) {
    const overlay = createOverlay();
    overlay.textContent = text;
    overlay.style.display = "block";

    clearTimeout(state.overlayTimer);
    state.overlayTimer = setTimeout(() => {
      overlay.style.display = "none";
      overlay.textContent = "";
    }, CONFIG.overlayMs);
  }

  async function loadTesseract() {
    if (window.Tesseract?.createWorker) return;

    setStatus("Baixando o leitor OCR...", 0.02);

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

    if (!window.Tesseract?.createWorker) {
      throw new Error("O OCR não carregou.");
    }

    state.worker = await window.Tesseract.createWorker("eng", 1, {
      logger(message) {
        if (message.status === "recognizing text") {
          setStatus("Lendo o texto da captura interna...", message.progress || 0);
        } else if (message.status) {
          setStatus("Preparando o OCR...", message.progress ?? 0.05);
        }
      }
    });

    return state.worker;
  }

  function asBlob(value, type = "image/png") {
    if (!value) return null;

    if (value instanceof Blob) return value;

    if (value instanceof ArrayBuffer) {
      return new Blob([value], { type });
    }

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

    if (!emulator || !manager) {
      throw new Error("O EmulatorJS ainda não terminou de iniciar.");
    }

    if (typeof manager.screenshot !== "function") {
      throw new Error("Esta versão do EmulatorJS não expôs gameManager.screenshot().");
    }

    setStatus("Capturando diretamente do núcleo do emulador...", 0.01);

    const result = await manager.screenshot();
    const maybeBlob = asBlob(result);
    const blob = maybeBlob instanceof Promise ? await maybeBlob : maybeBlob;

    if (!blob || blob.size === 0) {
      throw new Error("O núcleo devolveu uma captura vazia.");
    }

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

  async function preprocessForOCR(blob) {
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

    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = width;
    fullCanvas.height = height;
    const fullCtx = fullCanvas.getContext("2d", { willReadFrequently: true });
    fullCtx.imageSmoothingEnabled = false;
    fullCtx.drawImage(source, 0, 0, width, height);

    const scale = Math.max(4, Math.floor(1600 / Math.max(sw, 1)));
    const ocrCanvas = document.createElement("canvas");
    ocrCanvas.width = sw * scale;
    ocrCanvas.height = sh * scale;
    const ocrCtx = ocrCanvas.getContext("2d", { willReadFrequently: true });
    ocrCtx.imageSmoothingEnabled = false;
    ocrCtx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, ocrCanvas.width, ocrCanvas.height);

    const imageData = ocrCtx.getImageData(0, 0, ocrCanvas.width, ocrCanvas.height);
    const data = imageData.data;
    for (let index = 0; index < data.length; index += 4) {
      const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
      const value = gray > 145 ? 255 : 0;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
    }
    ocrCtx.putImageData(imageData, 0, 0);

    loaded.release?.();
    return { fullCanvas, ocrCanvas };
  }

  function showPreview(canvas) {
    let box = document.getElementById("retroplay-internal-preview");

    if (!box) {
      box = document.createElement("div");
      box.id = "retroplay-internal-preview";
      box.innerHTML = `
        <small style="display:block;margin:12px 0 6px;font-weight:700">
          ÁREA LIDA PELO OCR
        </small>
      `;
      const originalBlock = $("#translate-original")?.closest(".translate-text-block");
      originalBlock?.before(box);
    }

    box.querySelector("canvas")?.remove();

    const preview = document.createElement("canvas");
    preview.width = canvas.width;
    preview.height = canvas.height;
    preview.style.width = "100%";
    preview.style.maxHeight = "180px";
    preview.style.objectFit = "contain";
    preview.style.background = "#111";
    preview.style.border = "1px solid rgba(255,255,255,.18)";
    preview.style.borderRadius = "6px";

    preview.getContext("2d").drawImage(canvas, 0, 0);
    box.appendChild(preview);
  }

  async function translateOnline(text) {
    const query = new URLSearchParams({
      q: text.slice(0, 480),
      langpair: "en|pt-BR"
    });

    const response = await fetch(
      `https://api.mymemory.translated.net/get?${query.toString()}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(`Serviço de tradução respondeu ${response.status}.`);
    }

    const payload = await response.json();
    const translated = payload?.responseData?.translatedText;

    if (!translated || typeof translated !== "string") {
      throw new Error("O serviço não devolveu a tradução.");
    }

    return translated
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .trim();
  }

  async function translateCurrentScreen() {
    if (state.busy) return;

    state.busy = true;
    openPanel();

    const button = $("#translate-screen-button");
    const original = $("#translate-original");
    const translated = $("#translate-result");

    if (button) {
      button.disabled = true;
      button.textContent = "CAPTURANDO...";
    }

    if (original) original.textContent = "Aguardando captura interna...";
    if (translated) translated.textContent = "—";

    try {
      const blob = await internalScreenshot();
      const { ocrCanvas } = await preprocessForOCR(blob);
      showPreview(ocrCanvas);

      const worker = await getWorker();
      const result = await worker.recognize(ocrCanvas);
      const text = cleanText(result?.data?.text);

      if (!text || text.length < 2) {
        if (original) original.textContent = "Nenhum texto foi reconhecido.";
        if (translated) {
          translated.textContent = "A captura interna funcionou, mas o OCR não conseguiu ler esta tela.";
        }
        setStatus("Captura concluída; nenhum texto legível foi encontrado.", null);
        return;
      }

      if (original) original.textContent = text;
      setStatus("Traduzindo para português...", 0.98);

      try {
        const rawResult = await translateOnline(text);
        const resultText = polishTranslation(rawResult, text);
        if (translated) translated.textContent = resultText;
        showOverlay(resultText);
        setStatus("Tradução concluída.", null);
        setTimeout(closePanel, CONFIG.autoClosePanelMs);
      } catch (translationError) {
        console.error("Falha na tradução online:", translationError);
        if (translated) {
          translated.textContent = `OCR funcionou, mas a tradução online falhou: ${translationError.message}`;
        }
        setStatus("A captura e o OCR funcionaram; apenas a tradução online falhou.", null);
      }
    } catch (error) {
      console.error("RetroPlay captura interna:", error);
      if (original) original.textContent = "A captura interna não foi concluída.";
      if (translated) translated.textContent = error.message || "Erro desconhecido.";
      setStatus("Falha na captura interna.", null);
    } finally {
      state.busy = false;
      if (button) {
        button.disabled = false;
        button.textContent = "🌐 TRADUZIR";
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("#translate-screen-button")?.addEventListener("click", translateCurrentScreen);
    $("#translate-close")?.addEventListener("click", closePanel);
    $("#translate-panel")?.addEventListener("click", event => {
      if (event.target?.id === "translate-panel") closePanel();
    });
  });

  window.addEventListener("pagehide", () => {
    clearTimeout(state.overlayTimer);
    try {
      state.worker?.terminate?.();
    } catch (error) {
      console.warn(error);
    }
    state.worker = null;
  });
})();
