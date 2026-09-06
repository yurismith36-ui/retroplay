(() => {
  "use strict";

  const themes = [
    { id: "galaxia", nome: "Galáxia", webp: "imagens/backgrounds/galaxia.webp", jpg: "imagens/backgrounds/galaxia.jpg" },
    { id: "locadora-moderna", nome: "Locadora moderna", webp: "imagens/backgrounds/locadora-moderna.webp", jpg: "imagens/backgrounds/locadora-moderna.jpg" },
    { id: "locadora-vintage", nome: "Locadora vintage", webp: "imagens/backgrounds/locadora-vintage.webp", jpg: "imagens/backgrounds/locadora-vintage.jpg" }
  ];
  let previous = "";
  try {
    previous = sessionStorage.getItem("retroplay-last-console-theme") || "";
  } catch (error) {}

  const available = themes.filter(theme => theme.id !== previous);
  const pool = available.length ? available : themes;
  const selected = pool[Math.floor(Math.random() * pool.length)];

  try {
    sessionStorage.setItem("retroplay-last-console-theme", selected.id);
  } catch (error) {}
  // URLs absolutas evitam que o CSS procure as imagens dentro da pasta /css/.
  selected.webpUrl = new URL(selected.webp, document.baseURI).href;
  selected.jpgUrl = new URL(selected.jpg, document.baseURI).href;
  window.RETROPLAY_THEME = selected;

  const preload = document.createElement("link");
  preload.rel = "preload";
  preload.as = "image";
  preload.href = selected.webpUrl;
  preload.fetchPriority = "high";
  document.head.appendChild(preload);

  // ============================================================
  // RetroPlay - botão de instalação / navegador (teste do site)
  // Esta parte é autocontida para não exigir alteração no index.html.
  // ============================================================
  let deferredInstallPrompt = null;

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
  }

  function addStyles() {
    if (document.getElementById("retroplay-browser-install-style")) return;
    const style = document.createElement("style");
    style.id = "retroplay-browser-install-style";
    style.textContent = `
      #retroplay-install-strip {
        max-width: 1180px;
        margin: 10px auto 12px;
        padding: 10px 14px;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 14px;
        flex-wrap: wrap;
        border: 1px solid rgba(255,255,255,.18);
        border-radius: 10px;
        background: rgba(5,5,8,.88);
        box-shadow: 0 8px 24px rgba(0,0,0,.22);
      }
      #retroplay-install-strip .retroplay-install-label {
        font-weight: 900;
        letter-spacing: .7px;
        color: #fff;
        text-align: center;
        font-size: 14px;
      }
      #retroplay-browser-install-btn {
        appearance: none;
        border: 1px solid rgba(255,255,255,.45);
        border-radius: 8px;
        padding: 10px 16px;
        min-height: 42px;
        cursor: pointer;
        font: inherit;
        font-weight: 900;
        letter-spacing: .35px;
        color: #fff;
        background: linear-gradient(180deg,#7c3aed,#5b21b6);
        box-shadow: 0 5px 16px rgba(91,33,182,.38);
        text-transform: uppercase;
      }
      #retroplay-browser-install-btn:hover { filter: brightness(1.12); }
      #retroplay-browser-install-btn:active { transform: translateY(1px); }
      #retroplay-browser-modal {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(0,0,0,.78);
      }
      #retroplay-browser-modal.open { display: flex; }
      #retroplay-browser-modal .rp-modal-card {
        width: min(460px,100%);
        border: 1px solid rgba(255,255,255,.22);
        border-radius: 14px;
        padding: 20px;
        color: #fff;
        background: #101014;
        box-shadow: 0 24px 70px rgba(0,0,0,.55);
        font-family: Arial, sans-serif;
      }
      #retroplay-browser-modal h2 { margin: 0 0 10px; font-size: 20px; }
      #retroplay-browser-modal p { margin: 8px 0; line-height: 1.45; color: #e5e5ea; }
      #retroplay-browser-modal .rp-modal-actions {
        display: flex;
        gap: 10px;
        margin-top: 16px;
        flex-wrap: wrap;
      }
      #retroplay-browser-modal button {
        border: 0;
        border-radius: 8px;
        padding: 10px 14px;
        cursor: pointer;
        font-weight: 800;
      }
      #retroplay-browser-modal .rp-close { background: #2b2b31; color: #fff; }
      @media (max-width: 650px) {
        #retroplay-install-strip { margin: 8px 10px 10px; gap: 8px; }
        #retroplay-install-strip .retroplay-install-label { width: 100%; font-size: 12px; }
        #retroplay-browser-install-btn { width: 100%; font-size: 12px; }
      }
    `;
    document.head.appendChild(style);
  }

  function showModal(title, html) {
    let modal = document.getElementById("retroplay-browser-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "retroplay-browser-modal";
      modal.innerHTML = `
        <div class="rp-modal-card" role="dialog" aria-modal="true" aria-labelledby="rp-modal-title">
          <h2 id="rp-modal-title"></h2>
          <div id="rp-modal-text"></div>
          <div class="rp-modal-actions">
            <button type="button" class="rp-close">FECHAR</button>
          </div>
        </div>
      `;
      modal.addEventListener("click", event => {
        if (event.target === modal || event.target.closest(".rp-close")) {
          modal.classList.remove("open");
        }
      });
      document.body.appendChild(modal);
    }
    modal.querySelector("#rp-modal-title").textContent = title;
    modal.querySelector("#rp-modal-text").innerHTML = html;
    modal.classList.add("open");
  }

  async function handleInstall() {
    if (isStandalone()) {
      showModal("RETROPLAY JÁ INSTALADO", "<p>O RetroPlay já está aberto no modo aplicativo.</p>");
      return;
    }

    if (deferredInstallPrompt) {
      try {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        return;
      } catch (error) {}
    }

    if (isIOS()) {
      showModal(
        "INSTALAR RETROPLAY NO IPHONE",
        "<p>Para este teste no iPhone: toque no botão <b>Compartilhar</b> do Safari e escolha <b>Adicionar à Tela de Início</b>.</p>" +
        "<p>O navegador nativo RetroPlay ainda precisa ser compilado e assinado para virar um instalador de iPhone. Este botão já deixa o espaço e a experiência de instalação preparados no site.</p>"
      );
      return;
    }

    showModal(
      "INSTALAR RETROPLAY",
      "<p>Abra o menu do navegador e procure por <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>.</p>" +
      "<p>Quando o APK nativo do Navegador RetroPlay estiver compilado, este mesmo botão poderá apontar diretamente para ele no Android.</p>"
    );
  }

  function findExistingInstallLabel() {
    const wanted = "RETROPLAY NA TELA INICIAL";
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if ((node.nodeValue || "").toUpperCase().includes(wanted)) {
        return node.parentElement;
      }
    }
    return null;
  }

  function mountInstallButton() {
    if (document.getElementById("retroplay-browser-install-btn")) return;
    addStyles();

    const button = document.createElement("button");
    button.id = "retroplay-browser-install-btn";
    button.type = "button";
    button.innerHTML = "⬇ BAIXAR / INSTALAR NAVEGADOR RETROPLAY";
    button.addEventListener("click", handleInstall);

    const existingLabel = findExistingInstallLabel();
    if (existingLabel) {
      existingLabel.insertAdjacentElement("afterend", button);
      return;
    }

    // A versão publicada atualmente não possui a frase; cria a faixa completa.
    const strip = document.createElement("div");
    strip.id = "retroplay-install-strip";
    const label = document.createElement("span");
    label.className = "retroplay-install-label";
    label.textContent = "RETROPLAY NA TELA INICIAL";
    strip.appendChild(label);
    strip.appendChild(button);

    const header = document.querySelector(".site-header");
    const nav = document.querySelector(".main-nav");
    if (header && header.parentNode) {
      header.insertAdjacentElement("afterend", strip);
    } else if (nav && nav.parentNode) {
      nav.parentNode.insertBefore(strip, nav);
    } else {
      document.body.insertBefore(strip, document.body.firstChild);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountInstallButton, { once: true });
  } else {
    mountInstallButton();
  }
})();
