/*
 * RetroPlay — controles especiais para Nintendo VS. System
 * Aplica-se somente ao Battle City (VS), id nes-001.
 * O core NES padrão do EmulatorJS usa FCEUmm; nele, R2 é "Insert Coin".
 */
(() => {
  const gameId = new URLSearchParams(window.location.search).get("id");
  if (gameId !== "nes-001") return;

  window.EJS_controlScheme = "nes";
  window.EJS_VirtualGamepadSettings = [
    {
      type: "dpad",
      location: "left",
      left: "50%",
      right: "50%",
      joystickInput: false,
      inputValues: [4, 5, 6, 7]
    },
    {
      type: "button",
      text: "B",
      id: "nes-b",
      location: "right",
      left: 125,
      top: 50,
      bold: true,
      input_value: 0
    },
    {
      type: "button",
      text: "A",
      id: "nes-a",
      location: "right",
      left: 35,
      top: 50,
      bold: true,
      input_value: 8
    },
    {
      type: "button",
      text: "Select",
      id: "nes-select",
      location: "center",
      left: -10,
      fontSize: 15,
      block: true,
      input_value: 2
    },
    {
      type: "button",
      text: "Start",
      id: "nes-start",
      location: "center",
      left: 70,
      fontSize: 15,
      block: true,
      input_value: 3
    },
    {
      type: "button",
      text: "CRÉDITO",
      id: "vs-insert-coin",
      location: "center",
      left: 20,
      top: -68,
      fontSize: 15,
      bold: true,
      block: true,
      input_value: 13
    },
    {
      type: "button",
      text: "Rápido",
      id: "retro-fast-forward",
      location: "center",
      left: -35,
      top: 100,
      fontSize: 14,
      block: true,
      input_value: 27
    },
    {
      type: "button",
      text: "Lento",
      id: "retro-slow-motion",
      location: "center",
      left: 105,
      top: 100,
      fontSize: 14,
      block: true,
      input_value: 29
    }
  ];
})();
