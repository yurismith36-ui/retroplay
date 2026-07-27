(() => {
  "use strict";

  const VERSION = "0.4";
  const CONFIG = {
    intervaloMs: 4500,
    regiao: { x: 0.04, y: 0.58, largura: 0.92, altura: 0.37 },
    minimoCaracteres: 3,
    mostrarTextoOCR: true
  };

  let worker = null;
  let canvasJogo = null;
  let processando = false;
  let ligado = false;
  let timer = null;
  let ultimoTexto = "";

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function log(...args) {
    console.log(`[RetroPlay Tradução ${VERSION}]`, ...args);
  }

  function criarInterface() {
    if (document.getElementById("retroplay-translation-ui")) return;

    const style = document.createElement("style");
    style.id = "retroplay-translation-style";
    style.textContent = `
      #retroplay-translation-ui {
        position: fixed;
        right: 14px;
        bottom: 14px;
        z-index: 2147483646;
        display: flex;
        gap: 8px;
        align-items: center;
        font-family: Arial, sans-serif;
      }

      #retroplay-translation-toggle {
        appearance: none;
        border: 1px solid rgba(255,255,255,.22);
        border-radius: 999px;
        background: rgba(8,10,16,.94);
        color: #fff;
        padding: 10px 14px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(0,0,0,.38);
      }

      #retroplay-translation-toggle[data-active="true"] {
        background: #167a3d;
      }

      #retroplay-translation-status {
        display: none;
        border-radius: 999px;
        background: rgba(0,0,0,.82);
        color: #fff;
        padding: 8px 11px;
        font-size: 12px;
      }

      #retroplay-translation-overlay {
        position: fixed;
        left: 50%;
        bottom: 9%;
        transform: translateX(-50%);
        width: min(90vw, 900px);
        box-sizing: border-box;
        z-index: 2147483645;
        display: none;
        padding: 12px 18px;
        border: 1px solid rgba(255,255,255,.15);
        border-radius: 8px;
        background: rgba(0,0,0,.94);
        color: #fff;
        font-family: Arial, sans-serif;
        font-size: clamp(16px, 2.2vw, 25px);
        font-weight: 700;
        line-height: 1.35;
        text-align: center;
        text-shadow: 0 2px 2px #000;
        pointer-events: none;
      }

      @media (max-width: 600px) {
        #retroplay-translation-ui {
          right: 8px;
          bottom: 8px;
        }

        #retroplay-translation-toggle {
          padding: 9px 12px;
          font-size: 13px;
        }

        #retroplay-translation-overlay {
          bottom: 12%;
          width: 94vw;
          padding: 10px 12px;
        }
      }
    `;
    document.head.appendChild(style);

    const ui = document.createElement("div");
    ui.id = "retroplay-translation-ui";
    ui.innerHTML = `
      <span id="retroplay-translation-status"></span>
      <button id="retroplay-translation-toggle" type="button" data-active="false">
        🌐 Ativar tradução
      </button>
    `;
    document.body.appendChild(ui);

    const overlay = document.createElement("div");
    overlay.id = "retroplay-translation-overlay";
    overlay.setAttribute("aria-live", "polite");
    document.body.appendChild(overlay);

    document
      .getElementById("retroplay-translation-toggle")
      .addEventListener("click", alternar);
  }

  function setStatus(texto, mostrar = true) {
    const status = document.getElementById("retroplay-translation-status");
    if (!status) return;
    status.textContent = texto;
    status.style.display = mostrar ? "inline-block" : "none";
  }

  function mostrarLegenda(texto) {
    const overlay = document.getElementById("retroplay-translation-overlay");
    if (!overlay) return;
    overlay.textContent = texto;
    overlay.style.display = "block";
  }

  function esconderLegenda() {
    const overlay = document.getElementById("retroplay-translation-overlay");
    if (!overlay) return;
    overlay.textContent = "";
    overlay.style.display = "none";
  }

  function atualizarBotao() {
    const botao = document.getElementById("retroplay-translation-toggle");
    if (!botao) return;
    botao.dataset.active = String(ligado);
    botao.textContent = ligado ? "🌐 Desativar tradução" : "🌐 Ativar tradução";
  }

  async function localizarCanvas(timeoutMs = 20000) {
    const inicio = Date.now();

    while (Date.now() - inicio < timeoutMs) {
      const candidatos = [
        document.querySelector("#game canvas"),
        document.querySelector("#emulator canvas"),
        document.querySelector("canvas")
      ].filter(Boolean);

      const valido = candidatos.find(canvas =>
        canvas.width > 100 && canvas.height > 100
      );

      if (valido) return valido;
      await sleep(500);
    }

    return null;
  }

  async function prepararOCR() {
    if (worker) return true;

    if (!window.Tesseract) {
      throw new Error("Tesseract.js não foi carregado.");
    }

    setStatus("Carregando OCR...");
    worker = await window.Tesseract.createWorker("eng", 1, {
      logger: mensagem => {
        if (
          mensagem?.status === "recognizing text" &&
          Number.isFinite(mensagem.progress)
        ) {
          setStatus(`Lendo texto ${Math.round(mensagem.progress * 100)}%`);
        }
      }
    });

    setStatus("OCR pronto");
    window.setTimeout(() => setStatus("", false), 1200);
    return true;
  }

  function capturarRegiao(canvas) {
    const { x, y, largura, altura } = CONFIG.regiao;

    const sx = Math.max(0, Math.floor(canvas.width * x));
    const sy = Math.max(0, Math.floor(canvas.height * y));
    const sw = Math.max(1, Math.floor(canvas.width * largura));
    const sh = Math.max(1, Math.floor(canvas.height * altura));

    const escala = 2;
    const captura = document.createElement("canvas");
    captura.width = sw * escala;
    captura.height = sh * escala;

    const ctx = captura.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, captura.width, captura.height);

    const imagem = ctx.getImageData(0, 0, captura.width, captura.height);
    const dados = imagem.data;

    for (let i = 0; i < dados.length; i += 4) {
      const cinza =
        dados[i] * 0.299 +
        dados[i + 1] * 0.587 +
        dados[i + 2] * 0.114;

      const valor = cinza > 135 ? 255 : 0;
      dados[i] = valor;
      dados[i + 1] = valor;
      dados[i + 2] = valor;
    }

    ctx.putImageData(imagem, 0, 0);
    return captura;
  }

  function limparTexto(texto) {
    return String(texto || "")
      .replace(/\s+/g, " ")
      .replace(/[|_[\]{}<>]/g, "")
      .trim();
  }

  async function analisar() {
    if (!ligado || processando || document.hidden || !worker || !canvasJogo) {
      return;
    }

    if (!canvasJogo.isConnected || canvasJogo.width < 100) {
      canvasJogo = await localizarCanvas(3000);
      if (!canvasJogo) return;
    }

    processando = true;

    try {
      setStatus("Lendo diálogo...");
      const captura = capturarRegiao(canvasJogo);
      const resultado = await worker.recognize(captura);
      const texto = limparTexto(resultado?.data?.text);

      if (texto.length < CONFIG.minimoCaracteres) {
        setStatus("", false);
        esconderLegenda();
        return;
      }

      if (texto === ultimoTexto) {
        setStatus("", false);
        return;
      }

      ultimoTexto = texto;

      // Nesta versão segura, primeiro validamos o OCR.
      // A tradução por API será conectada depois sem sobrecarregar o emulador.
      if (CONFIG.mostrarTextoOCR) {
        mostrarLegenda(`OCR: ${texto}`);
      }

      setStatus("Texto detectado");
      window.setTimeout(() => setStatus("", false), 1200);
    } catch (erro) {
      console.error("[RetroPlay Tradução] Erro:", erro);
      setStatus("Falha ao ler texto");
    } finally {
      processando = false;
    }
  }

  async function ligar() {
    ligado = true;
    atualizarBotao();

    try {
      canvasJogo = await localizarCanvas();

      if (!canvasJogo) {
        throw new Error("Tela do jogo não encontrada.");
      }

      await prepararOCR();

      if (timer) clearInterval(timer);
      timer = window.setInterval(analisar, CONFIG.intervaloMs);
      await analisar();

      log("Ativado com segurança.");
    } catch (erro) {
      console.error("[RetroPlay Tradução]", erro);
      ligado = false;
      atualizarBotao();
      setStatus(erro.message || "Não foi possível iniciar");
    }
  }

  function desligar() {
    ligado = false;
    atualizarBotao();
    esconderLegenda();
    setStatus("", false);
    ultimoTexto = "";

    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    log("Desativado.");
  }

  async function alternar() {
    if (ligado) {
      desligar();
    } else {
      await ligar();
    }
  }

  async function encerrar() {
    desligar();

    if (worker) {
      try {
        await worker.terminate();
      } catch (erro) {
        console.warn("[RetroPlay Tradução] Falha ao encerrar OCR:", erro);
      }
      worker = null;
    }
  }

  criarInterface();
  window.addEventListener("pagehide", encerrar, { once: true });
  log("Arquivo carregado. Clique em “Ativar tradução”.");
})();
