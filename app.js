(() => {
  'use strict';

  const ROUTES = ['/', '/recursos-gratuitos', '/certificate-con-nosotros', '/sobre-nosotros'];
  const HEADER_OFFSET = 64;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ---------- Hash routing ---------- */
  const currentRoute = () => {
    const r = (location.hash || '#/').slice(1) || '/';
    return ROUTES.includes(r) ? r : '/';
  };

  function render() {
    const route = currentRoute();
    $$('[data-page]').forEach(p => { p.hidden = p.dataset.page !== route; });
    $$('.nav-links a').forEach(a => a.classList.toggle('is-active', a.dataset.route === route));
    if (route === '/') ensureVideoPlaying();
  }

  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

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

  /* ---------- Email forms (guía + waitlist) ---------- */
  $$('[data-form]').forEach(form => {
    form.addEventListener('submit', e => {
      e.preventDefault();
      form.hidden = true;
      $(`[data-done="${form.dataset.form}"]`).hidden = false;
    });
  });

  /* ---------- Diagnóstico ---------- */
  const QUESTIONS = [
    '¿Usas alguna IA en tu trabajo o negocio actualmente?',
    '¿Sabes qué pasa con la información que le compartes a una IA?',
    '¿Alguna vez has verificado si lo que te respondió una IA era correcto?',
    '¿Te preocupa el impacto ambiental de usar estas herramientas?',
    '¿Qué te gustaría entender mejor sobre IA?'
  ];
  const OPTIONS = ['Sí', 'No', 'No estoy seguro'];
  const CHOICE_COUNT = QUESTIONS.length - 1; // last question is free text
  const diag = { open: false, done: false, answers: {} };
  const diagList = $('#diag-list');

  function renderDiag() {
    const items = QUESTIONS.map((text, i) => {
      const n = String(i + 1).padStart(2, '0');
      let extra = '';
      if (diag.open && i < CHOICE_COUNT) {
        extra = `<div class="q__opts">${OPTIONS.map(label =>
          `<button type="button" class="opt${diag.answers[i] === label ? ' is-on' : ''}" data-q="${i}" data-a="${label}">${label}</button>`
        ).join('')}</div>`;
      } else if (diag.open) {
        extra = '<textarea rows="3" placeholder="Escríbelo con tus palabras"></textarea>';
      }
      return `<li class="q"><div class="q__row"><span class="num">${n}</span><span class="q__text">${text}</span></div>${extra}</li>`;
    });
    if (diag.open) {
      const status = diag.done
        ? 'Gracias. Pronto verás aquí tu resultado.'
        : `${Object.keys(diag.answers).length} de ${CHOICE_COUNT} respondidas`;
      items.push(`<li class="diag__footer"><button type="button" class="btn btn--forest btn--md" data-action="finish-diag">Ver mi resultado</button><span class="diag__status">${status}</span></li>`);
    }
    // Preserve free-text answer across re-renders
    const prev = $('textarea', diagList);
    const draft = prev ? prev.value : '';
    diagList.innerHTML = items.join('');
    const ta = $('textarea', diagList);
    if (ta) ta.value = draft;
    $('[data-action="open-diag"]').hidden = diag.open;
  }

  diagList.addEventListener('click', e => {
    const opt = e.target.closest('.opt');
    if (!opt) return;
    diag.answers[opt.dataset.q] = opt.dataset.a;
    renderDiag();
  });

  /* ---------- Actions ---------- */
  const ACTIONS = {
    'scroll-to-path': () => {
      const el = $('#doble-camino');
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET, behavior: 'smooth' });
    },
    'open-playbook': openPlaybook,
    'close-playbook': closePlaybook,
    'open-diag': () => { diag.open = true; renderDiag(); },
    'finish-diag': () => { diag.done = true; renderDiag(); }
  };

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (btn && ACTIONS[btn.dataset.action]) ACTIONS[btn.dataset.action]();
  });

  renderDiag();
  render();
})();
