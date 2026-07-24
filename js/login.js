const client = window.retroplaySupabase;
const forms = {
  login: document.querySelector("#login-form"),
  register: document.querySelector("#register-form"),
  forgot: document.querySelector("#forgot-form"),
  reset: document.querySelector("#reset-form")
};
const title = document.querySelector("#auth-title");
const subtitle = document.querySelector("#auth-subtitle");
const message = document.querySelector("#auth-message");

function showMessage(text, type = "info") {
  message.textContent = text;
  message.className = `auth-message ${type}`;
}
function setBusy(form, busy) {
  form.querySelector("button[type=submit]").disabled = busy;
}
function showForm(name) {
  Object.entries(forms).forEach(([key, form]) => form.classList.toggle("hidden", key !== name));
  const labels = {
    login: ["Entrar", "Acesse seus favoritos e saves em qualquer aparelho."],
    register: ["Criar conta", "Monte seu perfil gratuito no RetroPlay."],
    forgot: ["Recuperar senha", "Enviaremos um link para o seu e-mail."],
    reset: ["Nova senha", "Escolha uma nova senha para sua conta."]
  };
  [title.textContent, subtitle.textContent] = labels[name];
  message.className = "auth-message hidden";
}

document.querySelector("#show-login").onclick = () => showForm("login");
document.querySelector("#show-register").onclick = () => showForm("register");
document.querySelector("#show-forgot").onclick = () => showForm("forgot");

forms.login.addEventListener("submit", async event => {
  event.preventDefault(); setBusy(forms.login, true);
  const { error } = await client.auth.signInWithPassword({
    email: document.querySelector("#login-email").value.trim(),
    password: document.querySelector("#login-password").value
  });
  setBusy(forms.login, false);
  if (error) return showMessage("Não foi possível entrar: " + error.message, "error");
  location.replace("index.html");
});

forms.register.addEventListener("submit", async event => {
  event.preventDefault(); setBusy(forms.register, true);
  const { data, error } = await client.auth.signUp({
    email: document.querySelector("#register-email").value.trim(),
    password: document.querySelector("#register-password").value,
    options: {
      data: { display_name: document.querySelector("#register-name").value.trim() },
      emailRedirectTo: new URL("login.html", location.href).href
    }
  });
  setBusy(forms.register, false);
  if (error) return showMessage("Não foi possível criar a conta: " + error.message, "error");
  if (data.session) location.replace("index.html");
  else showMessage("Conta criada! Confira seu e-mail para confirmar o cadastro.", "success");
});

forms.forgot.addEventListener("submit", async event => {
  event.preventDefault(); setBusy(forms.forgot, true);
  const { error } = await client.auth.resetPasswordForEmail(
    document.querySelector("#forgot-email").value.trim(),
    { redirectTo: new URL("login.html?reset=1", location.href).href }
  );
  setBusy(forms.forgot, false);
  if (error) return showMessage("Não foi possível enviar o link: " + error.message, "error");
  showMessage("Link enviado. Verifique sua caixa de entrada e o spam.", "success");
});

forms.reset.addEventListener("submit", async event => {
  event.preventDefault(); setBusy(forms.reset, true);
  const { error } = await client.auth.updateUser({ password: document.querySelector("#reset-password").value });
  setBusy(forms.reset, false);
  if (error) return showMessage("Não foi possível alterar: " + error.message, "error");
  showMessage("Senha alterada. Você já pode entrar.", "success");
  setTimeout(() => showForm("login"), 1200);
});

(async () => {
  const { data } = await client.auth.getSession();
  if (new URLSearchParams(location.search).has("reset") || location.hash.includes("type=recovery")) {
    showForm("reset");
  } else if (data.session) {
    location.replace("index.html");
  }
})();
