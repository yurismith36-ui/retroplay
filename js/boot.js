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
})();
