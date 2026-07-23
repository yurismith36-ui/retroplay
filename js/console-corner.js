(() => {
  "use strict";

  const DEFAULT_THEME = {
    id: "galaxia",
    nome: "Galáxia",
    webpUrl: new URL("imagens/backgrounds/galaxia.webp", document.baseURI).href,
    jpgUrl: new URL("imagens/backgrounds/galaxia.jpg", document.baseURI).href
  };

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = async () => {
        try { await image.decode(); } catch (error) {}
        resolve(url);
      };
      image.onerror = reject;
      image.src = url;
    });
  }

  async function applyTheme() {
    const featuredArt = document.querySelector("#featured-art");
    if (!featuredArt) return;

    const theme = window.RETROPLAY_THEME || DEFAULT_THEME;
    featuredArt.classList.add("console-corner-loading");
    featuredArt.classList.remove("console-corner-ready", "console-corner-error");

    let loadedUrl = "";
    try {
      loadedUrl = await loadImage(theme.webpUrl || new URL(theme.webp || theme.imagem, document.baseURI).href);
    } catch (webpError) {
      try {
        loadedUrl = await loadImage(theme.jpgUrl || new URL(theme.jpg || "imagens/backgrounds/galaxia.jpg", document.baseURI).href);
      } catch (jpgError) {
        featuredArt.classList.remove("console-corner-loading");
        featuredArt.classList.add("console-corner-ready", "console-corner-error");
        return;
      }
    }

    // Aplicação direta e com URL absoluta: não depende de variável CSS nem da ordem dos scripts.
    featuredArt.style.backgroundImage =
      `linear-gradient(rgba(0,0,0,.16), rgba(0,0,0,.36)), url("${loadedUrl}")`;
    featuredArt.style.backgroundSize = "cover";
    featuredArt.style.backgroundPosition = "center center";
    featuredArt.style.backgroundRepeat = "no-repeat";
    featuredArt.dataset.backgroundTheme = theme.id || "tema";
    featuredArt.setAttribute("aria-label", `Cenário do jogo em destaque: ${theme.nome || "RetroPlay"}`);

    requestAnimationFrame(() => {
      featuredArt.classList.remove("console-corner-loading");
      featuredArt.classList.add("console-corner-ready");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyTheme, { once: true });
  } else {
    applyTheme();
  }
})();
