// RetroPlay Server 1.0 — sessão e utilidades de conta
(() => {
  const client = window.retroplaySupabase;
  if (!client) {
    console.error("Supabase não foi inicializado.");
    return;
  }

  let currentUser = null;
  const listeners = new Set();

  function emit() {
    window.dispatchEvent(new CustomEvent("retroplay-auth-changed", { detail: { user: currentUser } }));
    listeners.forEach(fn => fn(currentUser));
    updateHeader();
  }

  function displayName(user) {
    return user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Jogador";
  }

  function updateHeader() {
    const button = document.querySelector("#account-button");
    const welcome = document.querySelector(".welcome");
    if (button) {
      button.textContent = currentUser ? `👤 ${displayName(currentUser)}` : "👤 Entrar";
      button.classList.toggle("active", Boolean(currentUser));
      button.href = currentUser ? "conta.html" : "login.html";
    }
    if (welcome && currentUser) welcome.textContent = `Olá, ${displayName(currentUser)}!`;
  }

  async function initialize() {
    const { data, error } = await client.auth.getSession();
    if (error) console.warn("Não foi possível ler a sessão:", error.message);
    currentUser = data?.session?.user || null;
    emit();
  }

  client.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    emit();
  });

  window.RetroPlayAuth = {
    client,
    getUser: () => currentUser,
    displayName,
    onChange(fn) {
      listeners.add(fn);
      fn(currentUser);
      return () => listeners.delete(fn);
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      location.assign("index.html");
    }
  };

  initialize();
})();
