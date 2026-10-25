// Démarrage : routeur, barre d'onglets, bouton jaune, rafraîchissements.
import { ter } from './sncf.js';
import { tao } from './tao.js';
import { icon } from './ui.js';
import {
  Favs, HomeView, LineView, MapView, SettingsView, StopView, TaoView, TerView,
  closeSheet, go, handleDep, redrawSheet, sheetOpen,
} from './views.js';

const TABS = [
  { hash: '#/', icon: 'home', label: 'ACCUEIL' },
  { hash: '#/ter', icon: 'train', label: 'TER' },
  { hash: '#/tao', icon: 'bus', label: 'TAO' },
  { hash: '#/carte', icon: 'map', label: 'CARTE' },
  { hash: '#/reglages', icon: 'tune', label: 'RÉGLAGES' },
];

function route() {
  const h = location.hash || '#/';
  const parts = h.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  switch (parts[0]) {
    case '': return { view: HomeView, tab: 0, params: [] };
    case 'ter': return { view: TerView, tab: 1, params: [] };
    case 'tao': return { view: TaoView, tab: 2, params: [] };
    case 'arret': return { view: StopView, tab: 2, params: parts.slice(1) };
    case 'ligne': return { view: LineView, tab: 2, params: parts.slice(1) };
    case 'carte': return { view: MapView, tab: 3, params: [] };
    case 'reglages': return { view: SettingsView, tab: 4, params: [] };
    default: return { view: HomeView, tab: 0, params: [] };
  }
}

const viewEl = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
const fabEl = document.getElementById('fab');
let cur = null; // { view, params, unsubs, detach }

function renderTabs(active) {
  tabbar.innerHTML = `<div class="in">${TABS.map((t, i) => `<button class="tab ${i === active ? 'on' : ''}" data-action="go:${t.hash}" aria-label="${t.label}">
    <span class="pill">${icon(t.icon)}</span><span>${t.label}</span></button>`).join('')}</div>`;
}

function renderFab() {
  const f = cur?.view.fab?.();
  if (!f) { fabEl.hidden = true; return; }
  fabEl.hidden = false;
  fabEl.dataset.action = f.action;
  fabEl.setAttribute('aria-label', f.label);
  fabEl.classList.toggle('busy', !!f.busy || (f.action === 'ter-swap' ? false : false));
  fabEl.innerHTML = icon(f.icon);
}

function draw() {
  if (!cur) return;
  const v = cur.view;
  if (v.render) {
    const y = window.scrollY;
    viewEl.innerHTML = v.render(cur.params);
    window.scrollTo(0, y);
  } else if (v.update) {
    v.update(viewEl, cur.params);
  }
  renderFab();
}

let pending = false;
function scheduleDraw() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    draw();
    if (sheetOpen()) redrawSheet();
  });
}

function navigate() {
  const r = route();
  closeSheet(true);
  if (cur) {
    cur.unsubs.forEach((u) => u());
    cur.detach.forEach((d) => d());
    cur.view.unmount?.();
  }
  const sameView = cur && cur.view === r.view && JSON.stringify(cur.params) === JSON.stringify(r.params);
  cur = {
    view: r.view, params: r.params,
    unsubs: (r.view.subs || []).map((s) => s.on(scheduleDraw)),
    detach: (r.view.attach || []).map((s) => s.attach()),
  };
  viewEl.className = r.view.full ? 'full' : '';
  document.body.style.overflow = r.view.full ? 'hidden' : '';
  renderTabs(r.tab);
  if (r.view.mount) {
    viewEl.innerHTML = '';
    r.view.mount(viewEl, r.params);
    renderFab();
  } else draw();
  if (!sameView) window.scrollTo(0, 0);
}

// ───── clics (délégation) ─────
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a.startsWith('go:')) {
    e.preventDefault();
    closeSheet(true);
    const h = a.slice(3);
    if (location.hash === h || (h === '#/' && !location.hash)) navigate(); else go(h);
    return;
  }
  if (a === 'back') { if (history.length > 1) history.back(); else go('#/'); return; }
  if (a.startsWith('dep:')) { handleDep(a.slice(4)); return; }
  if (a.startsWith('fav-sheet:')) { Favs.toggle(a.slice(10)); redrawSheet(); return; }
  if (cur?.view.action?.(a, viewEl)) {
    if (cur.view.render) draw(); else renderFab();
  }
});

window.addEventListener('hashchange', navigate);
window.addEventListener('ot-rerender', () => scheduleDraw());

// Comptes à rebours et horloge
setInterval(() => {
  if (document.visibilityState === 'hidden' || !cur || cur.view === MapView || cur.view === SettingsView) return;
  if (document.activeElement?.tagName === 'INPUT') return;
  scheduleDraw();
}, 20000);

// Retour au premier plan : actualisation immédiate
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (cur?.view.attach?.includes(ter)) ter.refresh();
  if (cur?.view.attach?.includes(tao)) tao.refreshRt();
  scheduleDraw();
});

tao.init();
navigate();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
