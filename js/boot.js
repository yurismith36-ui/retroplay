(() => {
  "use strict";

  const themes = [
    { id: "galaxia", nome: "Galáxia", imagem: "imagens/backgrounds/galaxia.webp" },
    { id: "locadora-moderna", nome: "Locadora moderna", imagem: "imagens/backgrounds/locadora-moderna.webp" },
    { id: "locadora-vintage", nome: "Locadora vintage", imagem: "imagens/backgrounds/locadora-vintage.webp" }
  ];

  const previous = sessionStorage.getItem("retroplay-last-console-theme");
  const available = themes.filter(theme => theme.id !== previous);
  const pool = available.length ? available : themes;
  const selected = pool[Math.floor(Math.random() * pool.length)];

  sessionStorage.setItem("retroplay-last-console-theme", selected.id);
  window.RETROPLAY_THEME = selected;

  const preload = document.createElement("link");
  preload.rel = "preload";
  preload.as = "image";
  preload.href = selected.imagem;
  preload.fetchPriority = "high";
  document.head.appendChild(preload);
})();
