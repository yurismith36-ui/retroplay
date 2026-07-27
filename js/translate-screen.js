(() => {
  "use strict";

  const state = {
    worker: null,
    busy: false,
    overlayTimer: null
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
      .replace(/[|]{2,}/g, "I")
      .replace(/\s+/g, " ")
      .trim();
  }

  function createOverlay() {
    let overlay = document.getElementById("retroplay-translation-overlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "retroplay-translation-overlay";
    overlay.setAttribute("aria-live", "polite");

    Object.assign(overlay.style, {
      position: "fixed",
      left: "50%",
      bottom: "8%",
      transform: "translateX(-50%)",
      width: "min(92vw, 920px)",
      boxSizing: "border-box",
      display: "none",
      zIndex: "2147483646",
      padding: "14px 18px",
      borderRadius: "8px",
      border: "1px solid rgba(255,255,255,.18)",
      background: "rgba(0,0,0,.94)",
      color: "#fff",
      fontFamily: "Arial, sans-serif",
      fontSize: "clamp(16px, 2.2vw, 26px)",
      fontWeight: "700",
      lineHeight: "1.35",
      textAlign: "center",
      textShadow: "0 2px 2px #000",
      pointerEvents: "none"
    });

    document.body.appendChild(overlay);
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
    }, 12000);
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
      return new Blob(
        [value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)],
        { type }
      );
    }

    if (typeof value === "string") {
      if (value.startsWith("data:image/")) {
        const [header, encoded] = value.split(",", 2);
        const mime = header.match(/data:([^;]+)/)?.[1] || type;
        const binary = atob(encoded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
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

  async function blobToReadableCanvas(blob) {
    let bitmap = null;

    if ("createImageBitmap" in window) {
      try {
        bitmap = await createImageBitmap(blob);
      } catch (error) {
        console.warn("createImageBitmap falhou; usando Image.", error);
      }
    }

    let width;
    let height;
    let drawSource;

    if (bitmap) {
      width = bitmap.width;
      height = bitmap.height;
      drawSource = bitmap;
    } else {
      const url = URL.createObjectURL(blob);
      try {
        const image = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("A captura interna não pôde ser aberta."));
          img.src = url;
        });
        width = image.naturalWidth;
        height = image.naturalHeight;
        drawSource = image;
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    if (!width || !height) {
      throw new Error("A captura interna não possui dimensões válidas.");
    }

    const targetWidth = Math.min(1800, Math.max(width, width * 4));
    const scale = targetWidth / width;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingEnabled = false;
    context.drawImage(drawSource, 0, 0, canvas.width, canvas.height);

    bitmap?.close?.();

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let index = 0; index < data.length; index += 4) {
      const gray =
        data[index] * 0.299 +
        data[index + 1] * 0.587 +
        data[index + 2] * 0.114;

      const value = gray > 145 ? 255 : 0;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
    }

    context.putImageData(imageData, 0, 0);
    return canvas;
  }

  function showPreview(canvas) {
    let box = document.getElementById("retroplay-internal-preview");

    if (!box) {
      box = document.createElement("div");
      box.id = "retroplay-internal-preview";
      box.innerHTML = `
        <small style="display:block;margin:12px 0 6px;font-weight:700">
          CAPTURA INTERNA DO EMULADOR
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
    preview.style.maxHeight = "230px";
    preview.style.objectFit = "contain";
    preview.style.background = "#111";
    preview.style.border = "1px solid rgba(255,255,255,.18)";
    preview.style.borderRadius = "6px";

    const context = preview.getContext("2d");
    context.drawImage(canvas, 0, 0);

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
      const canvas = await blobToReadableCanvas(blob);

      showPreview(canvas);

      const worker = await getWorker();
      const result = await worker.recognize(canvas);
      const text = cleanText(result?.data?.text);

      if (!text || text.length < 2) {
        if (original) original.textContent = "Nenhum texto foi reconhecido.";
        if (translated) {
          translated.textContent =
            "A captura interna funcionou, mas o OCR não conseguiu ler esta tela.";
        }
        setStatus("Captura concluída; nenhum texto legível foi encontrado.", null);
        return;
      }

      if (original) original.textContent = text;

      setStatus("Traduzindo para português...", 0.98);

      try {
        const resultText = await translateOnline(text);
        if (translated) translated.textContent = resultText;
        showOverlay(resultText);
        setStatus("Tradução concluída.", null);
      } catch (translationError) {
        console.error("Falha na tradução online:", translationError);
        if (translated) {
          translated.textContent =
            `OCR funcionou, mas a tradução online falhou: ${translationError.message}`;
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
