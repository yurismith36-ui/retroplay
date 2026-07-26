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

  function prepareCanvas(sourceCanvas, crop = null) {
    const sx = crop?.x ?? 0;
    const sy = crop?.y ?? 0;
    const sw = crop?.width ?? sourceCanvas.width;
    const sh = crop?.height ?? sourceCanvas.height;

    const scale = Math.min(6, Math.max(3, 1500 / Math.max(sw, 1)));
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(sw * scale));
    output.height = Math.max(1, Math.round(sh * scale));

    const ctx = output.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, output.width, output.height);

    // Converte para alto contraste sem apagar completamente os tons médios.
    const image = ctx.getImageData(0, 0, output.width, output.height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114);
      const boosted = Math.max(0, Math.min(255, Math.round((gray - 70) * 1.65)));
      data[i] = boosted;
      data[i + 1] = boosted;
      data[i + 2] = boosted;
    }
    ctx.putImageData(image, 0, 0);
    return output;
  }

  function captureCandidates(canvas) {
    // 1) Região inferior: onde normalmente ficam as caixas de diálogo.
    const lowerDialogue = {
      x: 0,
      y: Math.floor(canvas.height * 0.56),
      width: canvas.width,
      height: Math.max(1, Math.floor(canvas.height * 0.44))
    };

    // 2) Tela inteira: serve para menus e textos fora da caixa inferior.
    return [
      { name: "caixa de diálogo", image: prepareCanvas(canvas, lowerDialogue) },
      { name: "tela inteira", image: prepareCanvas(canvas) }
    ];
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

      // Captura tudo antes de mostrar a legenda.
      const candidates = captureCandidates(canvas);
      await wait(40);
      showCaption("Preparando leitura...");

      const ocrWorker = await getWorker();
      let recognized = "";
      let usedRegion = "";

      for (const candidate of candidates) {
        status.textContent = `Lendo ${candidate.name}...`;
        const result = await ocrWorker.recognize(candidate.image);
        const text = cleanOCR(result?.data?.text);

        if (looksUseful(text)) {
          recognized = text;
          usedRegion = candidate.name;
          break;
        }
      }

      if (!looksUseful(recognized)) {
        status.textContent = "Nenhum texto foi reconhecido.";
        translatedText.textContent =
          "Deixe a caixa de diálogo inteira, sem animação, e toque novamente.";
        originalBox.hidden = true;
        return;
      }

      originalBox.hidden = false;
      originalText.textContent = recognized;
      status.textContent = `Texto encontrado na ${usedRegion}. Traduzindo...`;

      const translation = await translate(recognized);
      translatedText.textContent = translation;
      status.textContent = "Tradução concluída.";
    } catch (error) {
      console.error("[RetroPlay Translate]", error);
      showCaption("Não foi possível traduzir.");
      translatedText.textContent =
        error?.message || "Tente novamente com a caixa de diálogo visível.";
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
