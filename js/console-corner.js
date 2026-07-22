(() => {
  "use strict";

  const themes = [
    ["locadora-moderna", "Locadora moderna", "imagens/backgrounds/locadora-moderna.jpg"],
    ["galaxia", "Galáxia", "imagens/backgrounds/galaxia.jpg"],
    ["locadora-vintage", "Locadora vintage", "imagens/backgrounds/locadora-vintage.jpg"]
  ];

  function pickTheme() {
    const previous = sessionStorage.getItem("retroplay-console-corner-background");
    const options = themes.filter(([id]) => id !== previous);
    const pool = options.length ? options : themes;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    sessionStorage.setItem("retroplay-console-corner-background", chosen[0]);
    return chosen;
  }

  function start() {
    const art = document.querySelector("#featured-art");
    if (!art) return;

    const [id, name, file] = pickTheme();
    const image = new Image();
    art.classList.add("console-corner-loading");

    image.onload = () => {
      art.style.setProperty("--console-corner-background", `url("${file}")`);
      art.dataset.backgroundTheme = id;
      art.setAttribute("aria-label", `Cenário do jogo em destaque: ${name}`);
      requestAnimationFrame(() => {
        art.classList.remove("console-corner-loading");
        art.classList.add("console-corner-ready");
      });
    };

    image.onerror = () => {
      art.classList.remove("console-corner-loading");
    };

    image.src = file;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();