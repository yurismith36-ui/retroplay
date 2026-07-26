(() => {
  "use strict";

  const button = document.querySelector("#translate-screen-button");
  const caption = document.querySelector("#translate-caption");
  const closeButton = document.querySelector("#translate-caption-close");
  const status = document.querySelector("#translate-caption-status");
  const translatedText = document.querySelector("#translate-caption-text");
  const originalText = document.querySelector("#translate-original-text");
  const originalBox = document.querySelector("#translate-original-box");

  if (!button || !caption) return;

  let worker = null;
  let busy = false;

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  function showCaption(message = "Lendo a tela...") {
    caption.hidden = false;
    status.textContent = message;
    translatedText.textContent = "";
    originalText.textContent = "";
    originalBox.open = false;
  }

  function hideCaption() {
    caption.hidden = true;
  }

  function findGameCanvas() {
    const canvases = [...document.querySelectorAll("#game canvas")]
      .filter(canvas => canvas.width > 32 && canvas.height > 32);
    return canvases.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] || null;
  }

  function canvasHasVisiblePixels(canvas) {
    try {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return true; // WebGL: não force outro contexto.
      const sample = ctx.getImageData(
        Math.max(0, Math.floor(canvas.width * .2)),
        Math.max(0, Math.floor(canvas.height * .2)),
        Math.max(1, Math.floor(canvas.width * .6)),
        Math.max(1, Math.floor(canvas.height * .6))
      ).data;
      for (let i = 0; i < sample.length; i += 40) {
        if (sample[i] + sample[i + 1] + sample[i + 2] > 18 && sample[i + 3] > 20) return true;
      }
      return false;
    } catch {
      return true;
    }
  }

  function captureAndPrepare(canvas) {
    const scale = Math.min(4, Math.max(2, 1200 / Math.max(canvas.width, 1)));
    const output = document.createElement("canvas");
    output.width = Math.round(canvas.width * scale);
    output.height = Math.round(canvas.height * scale);
    const ctx = output.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;

    // A captura ocorre antes de a legenda ser exibida.
    ctx.drawImage(canvas, 0, 0, output.width, output.height);

    // Aumenta contraste para fontes pixeladas claras e escuras.
    const image = ctx.getImageData(0, 0, output.width, output.height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114);
      const contrasted = gray < 92 ? 0 : gray > 178 ? 255 : Math.round((gray - 92) * 2.965);
      data[i] = contrasted;
      data[i + 1] = contrasted;
      data[i + 2] = contrasted;
    }
    ctx.putImageData(image, 0, 0);
    return output;
  }

  async function getWorker() {
    if (worker) return worker;
    if (!window.Tesseract) throw new Error("O leitor OCR não foi carregado.");
    status.textContent = "Baixando o leitor de texto pela primeira vez...";
    worker = await Tesseract.createWorker("eng", 1, {
      logger(info) {
        if (info.status === "recognizing text") {
          status.textContent = `Lendo a tela... ${Math.round((info.progress || 0) * 100)}%`;
        }
      }
    });
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
      preserve_interword_spaces: "1"
    });
    return worker;
  }

  function cleanOCR(text) {
    return String(text || "")
      .replace(/[|]{2,}/g, "I")
      .replace(/[_~^`]+/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length >= 2)
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function looksUseful(text) {
    const letters = (text.match(/[A-Za-z]/g) || []).length;
    return text.length >= 4 && letters >= 3;
  }

  async function translateGoogle(text) {
    const url = "https://translate.googleapis.com/translate_a/single"
      + "?client=gtx&sl=auto&tl=pt&dt=t&q=" + encodeURIComponent(text);
    const response = await fetch(url);
    if (!response.ok) throw new Error("Google Translate indisponível.");
    const data = await response.json();
    const result = Array.isArray(data?.[0])
      ? data[0].map(part => part?.[0] || "").join("")
      : "";
    if (!result) throw new Error("Tradução vazia.");
    return result;
  }

  async function translateMyMemory(text) {
    const limited = text.slice(0, 450);
    const url = "https://api.mymemory.translated.net/get?q="
      + encodeURIComponent(limited) + "&langpair=en|pt-BR";
    const response = await fetch(url);
    if (!response.ok) throw new Error("Serviço alternativo indisponível.");
    const data = await response.json();
    const result = data?.responseData?.translatedText;
    if (!result) throw new Error("Tradução alternativa vazia.");
    return result;
  }

  async function translate(text) {
    try {
      return await translateGoogle(text);
    } catch (firstError) {
      console.warn("[RetroPlay Translate] Primeiro serviço falhou.", firstError);
      return await translateMyMemory(text);
    }
  }

  async function runTranslation() {
    if (busy) return;
    busy = true;
    button.disabled = true;
    button.textContent = "🌐 LENDO...";

    try {
      const canvas = findGameCanvas();
      if (!canvas) throw new Error("A tela do jogo ainda não apareceu.");

      // Captura primeiro; só depois mostra qualquer interface por cima do jogo.
      const prepared = captureAndPrepare(canvas);
      await wait(40);
      showCaption("Preparando leitura...");

      if (!canvasHasVisiblePixels(prepared)) {
        throw new Error("A captura saiu vazia. Aguarde a imagem do jogo aparecer e tente novamente.");
      }

      const ocrWorker = await getWorker();
      const result = await ocrWorker.recognize(prepared);
      const recognized = cleanOCR(result?.data?.text);

      if (!looksUseful(recognized)) {
        status.textContent = "Nenhum texto foi reconhecido.";
        translatedText.textContent = "Tente novamente quando a caixa de diálogo estiver inteira e parada.";
        originalBox.hidden = true;
        return;
      }

      originalBox.hidden = false;
      originalText.textContent = recognized;
      status.textContent = "Traduzindo...";
      const translation = await translate(recognized);
      translatedText.textContent = translation;
      status.textContent = "Tradução concluída.";
    } catch (error) {
      console.error("[RetroPlay Translate]", error);
      showCaption("Não foi possível traduzir.");
      translatedText.textContent = error?.message || "Tente novamente com a caixa de diálogo visível.";
      originalBox.hidden = true;
    } finally {
      busy = false;
      button.disabled = false;
      button.textContent = "🌐 TRADUZIR TELA";
    }
  }

  button.addEventListener("click", runTranslation);
  closeButton?.addEventListener("click", hideCaption);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !caption.hidden) hideCaption();
  });

  window.RetroPlayTranslate = {
    translateScreen: runTranslation,
    close: hideCaption
  };
})();
