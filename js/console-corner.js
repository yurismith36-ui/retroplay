(() => {
  "use strict";

  function applyTheme() {
    const featuredArt = document.querySelector("#featured-art");
    const theme = window.RETROPLAY_THEME;
    if (!featuredArt || !theme) return;

    featuredArt.classList.add("console-corner-loading");

    const image = new Image();
    image.decoding = "async";
    image.src = theme.imagem;

    image.onload = async () => {
      try { await image.decode(); } catch (error) {}

      featuredArt.style.setProperty(
        "--console-corner-background",
        `url("${theme.imagem}")`
      );
      featuredArt.dataset.backgroundTheme = theme.id;
      featuredArt.setAttribute("aria-label", `Cenário do jogo em destaque: ${theme.nome}`);

      requestAnimationFrame(() => {
        featuredArt.classList.remove("console-corner-loading");
        featuredArt.classList.add("console-corner-ready");
      });
    };

    image.onerror = () => {
      featuredArt.classList.remove("console-corner-loading");
      featuredArt.classList.add("console-corner-ready");
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyTheme, { once: true });
  } else {
    applyTheme();
  }
})();
