(() => {
  'use strict';

  const TARGET_TEXT = 'RETROPLAY NA TELA INICIAL';
  let deferredPrompt = null;
  let mounted = false;

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const isIOS = () => {
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    return /iPhone|iPad|iPod/i.test(ua) ||
      (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  };

  const isAndroid = () => /Android/i.test(navigator.userAgent || '');

  function normalize(s) {
    return (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function findTarget() {
    const wanted = normalize(TARGET_TEXT);
    const all = document.querySelectorAll('body *');
    for (const el of all) {
      if (el.children.length > 4) continue;
      const text = normalize(el.textContent);
      if (text === wanted || text.includes(wanted)) return el;
    }
    return null;
  }

  function createModal() {
    let modal = document.getElementById('rp-browser-install-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'rp-browser-install-modal';
    modal.className = 'rp-browser-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="rp-browser-modal__backdrop" data-rp-close></div>
      <section class="rp-browser-modal__card" role="dialog" aria-modal="true" aria-labelledby="rp-browser-modal-title">
        <button class="rp-browser-modal__close" type="button" aria-label="Fechar" data-rp-close>×</button>
        <div class="rp-browser-modal__icon">🎮</div>
        <h2 id="rp-browser-modal-title">Instalar Navegador RetroPlay</h2>
        <div class="rp-browser-modal__content" id="rp-browser-modal-content"></div>
      </section>`;

    document.body.appendChild(modal);
    modal.querySelectorAll('[data-rp-close]').forEach(el => {
      el.addEventListener('click', () => closeModal());
    });
    return modal;
  }

  function openModal(html) {
    const modal = createModal();
    modal.querySelector('#rp-browser-modal-content').innerHTML = html;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('rp-install-modal-open');
  }

  function closeModal() {
    const modal = document.getElementById('rp-browser-install-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('rp-install-modal-open');
  }

  async function handleInstall() {
    if (isStandalone()) {
      openModal(`
        <p class="rp-browser-ok">✓ O RetroPlay já está instalado neste aparelho.</p>
        <button class="rp-browser-primary" type="button" onclick="location.href='./'">ABRIR RETROPLAY</button>`);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') deferredPrompt = null;
      return;
    }

    if (isIOS()) {
      openModal(`
        <p>No iPhone, instale o <strong>RetroPlay</strong> pela Tela de Início:</p>
        <ol class="rp-browser-steps">
          <li>Toque em <strong>Compartilhar</strong> <span class="rp-share-icon">□↑</span>.</li>
          <li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>
          <li>Toque em <strong>Adicionar</strong>.</li>
        </ol>
        <p class="rp-browser-note">Ele ficará com ícone próprio e abrirá em tela separada, como um aplicativo.</p>
        <button class="rp-browser-primary" type="button" data-rp-close>ENTENDI</button>`);
      const modal = document.getElementById('rp-browser-install-modal');
      modal.querySelectorAll('[data-rp-close]').forEach(el => el.addEventListener('click', closeModal));
      return;
    }

    if (isAndroid()) {
      openModal(`
        <p>O navegador não ofereceu a instalação automática.</p>
        <p>Abra o menu do navegador e escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</p>
        <button class="rp-browser-primary" type="button" data-rp-close>ENTENDI</button>`);
      const modal = document.getElementById('rp-browser-install-modal');
      modal.querySelectorAll('[data-rp-close]').forEach(el => el.addEventListener('click', closeModal));
      return;
    }

    openModal(`
      <p>Use o menu do navegador e escolha <strong>Instalar RetroPlay</strong> ou <strong>Adicionar à tela inicial</strong>.</p>
      <button class="rp-browser-primary" type="button" data-rp-close>ENTENDI</button>`);
    const modal = document.getElementById('rp-browser-install-modal');
    modal.querySelectorAll('[data-rp-close]').forEach(el => el.addEventListener('click', closeModal));
  }

  function buildButton() {
    const wrap = document.createElement('span');
    wrap.className = 'rp-browser-install-wrap';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rp-browser-install-btn';
    btn.innerHTML = '<span class="rp-browser-install-btn__icon">⬇</span><span>BAIXAR / INSTALAR<br>NAVEGADOR RETROPLAY</span>';
    btn.addEventListener('click', handleInstall);

    wrap.appendChild(btn);
    return wrap;
  }

  function mount() {
    if (mounted || isStandalone()) return;
    const target = findTarget();
    if (!target) return;

    if (document.querySelector('.rp-browser-install-wrap')) {
      mounted = true;
      return;
    }

    const button = buildButton();
    target.classList.add('rp-install-target');
    target.insertAdjacentElement('afterend', button);
    mounted = true;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    mount();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const btn = document.querySelector('.rp-browser-install-wrap');
    if (btn) btn.remove();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }

  const observer = new MutationObserver(() => {
    if (!mounted) mount();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  setTimeout(() => observer.disconnect(), 20000);
})();
