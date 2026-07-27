/*
  RetroPlay Translate — perfis por jogo
  x, y, width e height usam valores de 0 a 1 em relação ao canvas do jogo.
  Para adicionar outro jogo, copie um perfil e ajuste a área.
*/
window.RETROPLAY_TRANSLATE_PROFILES = {
  "the machine": {
    language: "en",
    autoTranslate: true,
    intervalMs: 4200,
    dialogue: {
      x: 0.045,
      y: 0.705,
      width: 0.91,
      height: 0.19
    }
  }
};

/*
  Jogos sem perfil:
  - idioma pt-BR: tradução fica desligada;
  - idioma estrangeiro informado pela URL (?lang=en ou ?idioma=en): tradução automática liga;
  - sem idioma informado: tradução fica desligada para evitar ativação em jogos PT-BR.
*/
window.RETROPLAY_TRANSLATE_DEFAULTS = {
  language: "",
  autoTranslate: false,
  intervalMs: 4500,
  dialogue: {
    x: 0.04,
    y: 0.68,
    width: 0.92,
    height: 0.22
  }
};
