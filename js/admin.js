
const SYSTEM_FOLDERS = {
  "SNES": "snes",
  "Game Boy": "gb",
  "Game Boy Color": "gbc",
  "Game Boy Advance": "gba",
  "Nintendo 64": "n64",
  "Arcade": "arcade",
  "Neo Geo": "neogeo"
};

const form = document.querySelector("#game-form");
const output = document.querySelector("#json-output");
const guide = document.querySelector("#folder-guide");
const copyButton = document.querySelector("#copy-button");

function normalizeFileName(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateGame(event) {
  if (event) event.preventDefault();

  const [consoleName, core, defaultExtension] =
    document.querySelector("#game-console").value.split("|");

  const folder = SYSTEM_FOLDERS[consoleName];
  const prefix = folder === "neogeo" ? "neo" : folder;
  const numberValue = Math.max(1, Number(document.querySelector("#game-number").value || 1));
  const number = String(numberValue).padStart(3, "0");
  const name = document.querySelector("#game-name").value.trim() || "Nome do jogo";

  let romFile = document.querySelector("#game-rom").value.trim();
  if (!romFile) {
    romFile = `${normalizeFileName(name) || "jogo"}.${defaultExtension}`;
  }

  const basePath = `jogos/${folder}/jogo-${number}`;
  const game = {
    id: `${prefix}-${number}`,
    nome: name,
    console: consoleName,
    ano: document.querySelector("#game-year").value.trim(),
    genero: document.querySelector("#game-genre").value.trim(),
    desenvolvedora: document.querySelector("#game-developer").value.trim(),
    descricao: document.querySelector("#game-description").value.trim(),
    destaque: document.querySelector("#game-featured").checked,
    core,
    rom: `${basePath}/rom/${romFile}`,
    capa: `${basePath}/imagens/capa.jpg`,
    banner: `${basePath}/imagens/banner.jpg`,
    logo: `${basePath}/imagens/logo.png`,
    ordem: numberValue,
    adicionadoEm: new Date().toISOString().slice(0, 10)
  };

  if (consoleName === "Neo Geo") {
    game.bios = "jogos/neogeo/bios/neogeo.zip";
  }

  output.value = JSON.stringify(game, null, 2);

  guide.innerHTML = `
    <strong>Pasta do jogo:</strong><br>
    <code>${basePath}/rom/</code><br>
    <code>${basePath}/imagens/</code><br><br>
    <strong>Nome da ROM:</strong> <code>${romFile}</code>
    ${consoleName === "Neo Geo"
      ? `<br><br><strong>BIOS:</strong> <code>jogos/neogeo/bios/neogeo.zip</code>`
      : ""}`;
}

form.addEventListener("submit", generateGame);
form.addEventListener("input", () => generateGame());

copyButton.addEventListener("click", async () => {
  if (!output.value) generateGame();
  try {
    await navigator.clipboard.writeText(output.value);
    const oldText = copyButton.textContent;
    copyButton.textContent = "COPIADO!";
    setTimeout(() => copyButton.textContent = oldText, 1400);
  } catch {
    output.select();
    document.execCommand("copy");
  }
});

document.querySelector("#download-button").addEventListener("click", () => {
  if (!output.value) generateGame();
  const blob = new Blob([output.value], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "novo-jogo.json";
  anchor.click();
  URL.revokeObjectURL(url);
});

generateGame();
