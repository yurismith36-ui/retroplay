(() => {
  "use strict";

  const themes = [
    {
      id: "locadora-moderna",
      nome: "Locadora moderna",
      arquivo: "imagens/backgrounds/locadora-moderna.jpg"
    },
    {
      id: "galaxia",
      nome: "Galáxia",
      arquivo: "imagens/backgrounds/galaxia.jpg"
    },
    {
      id: "locadora-vintage",
      nome: "Locadora vintage",
      arquivo: "imagens/backgrounds/locadora-vintage.jpg"
    }
  ];

  function chooseTheme() {
    const previous = sessionStorage.getItem("retroplay-last-console-theme");
    const available = themes.filter(theme => theme.id !== previous);
    const pool = available.length ? available : themes;
    const selected = pool[Math.floor(Math.random() * pool.length)];

    sessionStorage.setItem("retroplay-last-console-theme", selected.id);
    return selected;
  }

  function applyTheme() {
    const featuredArt = document.querySelector("#featured-art");
    if (!featuredArt) return;

    const theme = chooseTheme();
    const versionedUrl = `${theme.arquivo}?v=2`;
    const preload = new Image();

    featuredArt.classList.add("console-corner-loading");

    preload.onload = () => {
      featuredArt.style.setProperty(
        "--console-corner-background",
        `url("${versionedUrl}")`
      );
      featuredArt.dataset.backgroundTheme = theme.id;
      featuredArt.setAttribute(
        "aria-label",
        `Cenário do jogo em destaque: ${theme.nome}`
      );

      requestAnimationFrame(() => {
        featuredArt.classList.remove("console-corner-loading");
        featuredArt.classList.add("console-corner-ready");
      });
    };

    preload.onerror = () => {
      featuredArt.classList.remove("console-corner-loading");
      featuredArt.style.setProperty(
        "--console-corner-background",
        "linear-gradient(145deg, #170b20, #020203)"
      );
    };

    preload.src = versionedUrl;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyTheme, { once: true });
  } else {
    applyTheme();
  }
})();