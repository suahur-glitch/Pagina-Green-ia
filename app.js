(() => {
  'use strict';

  const ROUTES = ['/', '/recursos-gratuitos', '/certificate-con-nosotros', '/sobre-nosotros'];
  const HEADER_OFFSET = 64;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ---------- Path-based routing (History API) ---------- */
  const currentRoute = () => {
    const r = location.pathname || '/';
    return ROUTES.includes(r) ? r : '/';
  };

  const TITLES = {
    '/': 'somosgreenia · Primero criterio, luego IA',
    '/recursos-gratuitos': 'Recursos gratuitos para usar la IA con criterio · somosgreenia',
    '/certificate-con-nosotros': 'Certifícate con nosotros · somosgreenia',
    '/sobre-nosotros': 'Sobre nosotros · somosgreenia'
  };

  function render() {
    const route = currentRoute();
    document.title = TITLES[route];
    $$('[data-page]').forEach(p => { p.hidden = p.dataset.page !== route; });
    $$('.nav-links a').forEach(a => a.classList.toggle('is-active', a.dataset.route === route));
    if (route === '/') ensureVideoPlaying();
  }

  function navigate(path, { replace = false } = {}) {
    if (location.pathname === path) { render(); return; }
    history[replace ? 'replaceState' : 'pushState']({}, '', path);
    render();
    window.scrollTo(0, 0);
  }

  window.addEventListener('popstate', () => { render(); window.scrollTo(0, 0); });

  // Intercept clicks on same-origin internal links so navigation never triggers
  // a full page reload, but a direct URL load / refresh still works via the server.
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    let url;
    try { url = new URL(a.href, location.href); } catch { return; }
    if (url.origin !== location.origin) return; // external link (Instagram, LinkedIn, Substack…)
    if (!ROUTES.includes(url.pathname)) return; // not one of our routes: let it behave normally
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // open-in-new-tab shortcuts
    e.preventDefault();
    navigate(url.pathname);
  });

  /* ---------- Hero video: always muted + looping ---------- */
  function ensureVideoPlaying() {
    const v = $('#hero-video');
    if (!v) return;
    v.muted = true;
    v.loop = true;
    if (v.paused) v.play().catch(() => {});
  }

  /* ---------- Playbook modal ---------- */
  const modal = $('#playbook-modal');
  const openPlaybook = () => { modal.hidden = false; };
  const closePlaybook = () => { modal.hidden = true; };
  modal.addEventListener('click', e => { if (e.target === modal) closePlaybook(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closePlaybook(); });

  /* ---------- Actions ---------- */
  const ACTIONS = {
    'scroll-to-path': () => {
      const el = $('#doble-camino');
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET, behavior: 'smooth' });
    },
    'open-playbook': openPlaybook,
    'close-playbook': closePlaybook
  };

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (btn && ACTIONS[btn.dataset.action]) ACTIONS[btn.dataset.action]();
  });

  render();
})();
