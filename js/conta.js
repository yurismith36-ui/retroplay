window.addEventListener("retroplay-auth-changed", async event => {
  const user = event.detail.user;
  if (!user) return location.replace("login.html");
  document.querySelector("#account-loading").classList.add("hidden");
  document.querySelector("#account-content").classList.remove("hidden");
  document.querySelector("#profile-name").textContent = window.RetroPlayAuth.displayName(user);
  document.querySelector("#profile-email").textContent = user.email || "";
  const [{ count: favoriteCount }, { count: saveCount }] = await Promise.all([
    window.retroplaySupabase.from("favorites").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    window.retroplaySupabase.from("game_saves").select("*", { count: "exact", head: true }).eq("user_id", user.id)
  ]);
  document.querySelector("#favorite-count").textContent = favoriteCount || 0;
  document.querySelector("#save-count").textContent = saveCount || 0;
});
document.querySelector("#logout-button").onclick = () => window.RetroPlayAuth.signOut();
