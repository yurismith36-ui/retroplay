// RetroPlay Server 1.0 — favoritos e saves na nuvem
(() => {
  const client = window.retroplaySupabase;
  if (!client) return;

  async function getFavorites() {
    const user = window.RetroPlayAuth?.getUser();
    if (!user) return [];
    const { data, error } = await client
      .from("favorites")
      .select("game_id")
      .eq("user_id", user.id);
    if (error) throw error;
    return (data || []).map(row => row.game_id);
  }

  async function addFavorite(gameId) {
    const user = window.RetroPlayAuth?.getUser();
    if (!user) return false;
    const { error } = await client.from("favorites").upsert(
      { user_id: user.id, game_id: gameId },
      { onConflict: "user_id,game_id" }
    );
    if (error) throw error;
    return true;
  }

  async function removeFavorite(gameId) {
    const user = window.RetroPlayAuth?.getUser();
    if (!user) return false;
    const { error } = await client
      .from("favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("game_id", gameId);
    if (error) throw error;
    return true;
  }

  async function mergeLocalFavorites(localIds) {
    const user = window.RetroPlayAuth?.getUser();
    if (!user) return localIds;
    const cloudIds = await getFavorites();
    const merged = [...new Set([...(localIds || []), ...cloudIds])];
    if (merged.length) {
      const rows = merged.map(gameId => ({ user_id: user.id, game_id: gameId }));
      const { error } = await client.from("favorites").upsert(rows, { onConflict: "user_id,game_id" });
      if (error) throw error;
    }
    return merged;
  }

  async function saveGame(gameId, slot, saveData, metadata = {}) {
    const user = window.RetroPlayAuth?.getUser();
    if (!user) throw new Error("Entre na sua conta para salvar na nuvem.");
    const { data, error } = await client.from("game_saves").upsert({
      user_id: user.id,
      game_id: gameId,
      slot: Number(slot) || 1,
      save_data: saveData,
      metadata,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id,game_id,slot" }).select().single();
    if (error) throw error;
    return data;
  }

  async function loadGameSave(gameId, slot = 1) {
    const user = window.RetroPlayAuth?.getUser();
    if (!user) return null;
    const { data, error } = await client.from("game_saves")
      .select("*")
      .eq("user_id", user.id)
      .eq("game_id", gameId)
      .eq("slot", Number(slot) || 1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  window.RetroPlayCloud = { getFavorites, addFavorite, removeFavorite, mergeLocalFavorites, saveGame, loadGameSave };
})();
