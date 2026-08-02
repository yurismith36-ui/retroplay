// RetroPlay Account 2.0 — registro leve de progresso do jogador.
(() => {
  "use strict";

  const client = window.retroplaySupabase;
  if (!client) return;

  async function getAuthenticatedUser() {
    const current = window.RetroPlayAuth?.getUser?.();
    if (current) return current;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data?.session?.user || null;
  }

  function isSchemaMissing(error) {
    const text = String(error?.message || error || "");
    return error?.code === "42P01"
      || error?.code === "PGRST202"
      || /retroplay_record_game_start|player_game_activity|schema cache|does not exist/i.test(text);
  }

  async function recordGameStarted(game) {
    const user = await getAuthenticatedUser();
    if (!user || !game?.id) return false;

    const { error } = await client.rpc("retroplay_record_game_start", {
      p_game_id: String(game.id),
      p_game_name: String(game.nome || game.name || game.id),
      p_game_console: String(game.console || "Console"),
      p_game_cover: String(game.capa || game.cover || "")
    });

    if (error) {
      if (!isSchemaMissing(error)) console.warn("Não foi possível registrar o jogo iniciado:", error.message);
      return false;
    }
    return true;
  }

  async function setGameCompleted(game, completed = true) {
    const user = await getAuthenticatedUser();
    if (!user || !game?.id) throw new Error("Entre na sua conta para salvar o progresso.");

    const { error } = await client.rpc("retroplay_set_game_completed", {
      p_game_id: String(game.id),
      p_game_name: String(game.nome || game.name || game.id),
      p_game_console: String(game.console || "Console"),
      p_game_cover: String(game.capa || game.cover || ""),
      p_completed: Boolean(completed)
    });

    if (error) throw error;
    return true;
  }

  async function recordOnlineResult({ game, opponentName, result, roomCode = "" }) {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Entre na sua conta para registrar a partida.");
    if (!game?.id) throw new Error("Escolha o jogo.");
    if (!['win', 'loss', 'draw'].includes(result)) throw new Error("Resultado inválido.");

    const { error } = await client.from("player_online_matches").insert({
      user_id: user.id,
      game_id: String(game.id),
      game_name: String(game.nome || game.name || game.id),
      game_console: String(game.console || "Console"),
      game_cover: String(game.capa || game.cover || ""),
      opponent_name: String(opponentName || "Rival").trim().slice(0, 40),
      result,
      room_code: String(roomCode || "").trim().toUpperCase().slice(0, 12)
    });

    if (error) throw error;
    return true;
  }

  window.RetroPlayStats = {
    recordGameStarted,
    setGameCompleted,
    recordOnlineResult,
    isSchemaMissing
  };
})();
