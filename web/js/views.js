// Écrans de l'application (format vertical).
import { Settings, cartoTiles } from './config.js';
import { ter } from './sncf.js';
import { tao, compareRoutes } from './tao.js';
import {
  bullet, chip, closeSheet, empty, icon, openSheet, redrawSheet, routeBullet, sheetOpen,
  spinner, terBullet, terChip, timeline, toast,
} from './ui.js';
import { countdown, dateLabel, esc, fromEpoch, hhmm, norm } from './util.js';

export const go = (hash) => { location.hash = hash; };

// ───────────── favoris ─────────────
export const Favs = {
  list() { return Settings.favorites; },
  has(id) { return Settings.favorites.includes(id); },
  toggle(id) {
    const l = Settings.favorites;
    const i = l.indexOf(id);
    if (i >= 0) l.splice(i, 1); else l.push(id);
    Settings.favorites = l;
    toast(i >= 0 ? 'Retiré des favoris' : 'Ajouté aux favoris ★');
  },
};

const delayClass = (d) => (d.cancelled ? 'c-red' : d.theoretical ? 'c-theo' : d.delay == null ? '' : d.delay >= 2 ? 'c-red' : 'c-green');

function backHead(title, sub = '', right = '') {
  return `<div class="head">
    <button class="back" data-action="back" aria-label="Retour">${icon('back')}</button>
    <div class="grow"><div class="h2 ellipsis">${title}</div>${sub ? `<div class="small muted ellipsis">${sub}</div>` : ''}</div>${right}</div>`;
}

// ═════════════════════════ ACCUEIL ═════════════════════════
export const HomeView = {
  subs: [ter, tao],
  attach: [ter, tao],
  render() {
    boardDeps = [];
    const now = new Date();
    const next = (b) => b?.trains.find((t) => t.dep > now);
    const line = (dir, t) => {
      if (!t) return `${dir} —`;
      const s = { cancelled: 'SUPPRIMÉ', delayed: `+${t.delay} MIN`, onTime: "À L'HEURE", disrupted: 'PERTURBÉ' }[t.state] || 'THÉORIQUE';
      return `${dir} ${hhmm(t.dep)} · ${s}`;
    };
    const a = next(ter.toOrleans), o = next(ter.toArtenay);
    const terBad = ter.disruptions.length || [a, o].some((t) => t && (t.state === 'cancelled' || t.state === 'delayed'));
    const ready = tao.phase === 'ready';
    const disturbed = ready ? tao.lineStatuses().filter((s) => s.health !== 'ok').length : 0;

    const favs = Favs.list().map((id) => tao.groupById?.get(id)).filter(Boolean);
    let favHtml;
    if (!ready) favHtml = tao.phase === 'error' ? empty('⚠️', tao.error) : spinner();
    else if (!favs.length) favHtml = empty('☆', 'Aucun favori. Ouvrez un arrêt TAO et touchez ★.', '<button class="btn" data-action="go:#/tao">CHOISIR UN ARRÊT</button>');
    else favHtml = favs.map((g) => {
      const rows = tao.board(g.idx, 2).slice(0, 3);
      return `<button class="secthead row-flex" style="width:100%;text-align:left" data-action="go:#/arret/${esc(g.id)}">
          <span class="grow h2 ellipsis" style="font-size:16px">${esc(g.name.toUpperCase())}</span><span class="chev">›</span></button>
        ${rows.length ? rows.map((r) => boardRow(r, g.idx, 2, true)).join('') : '<div class="small muted" style="padding:2px 18px 12px">Aucun passage annoncé</div>'}
        <div class="divider" style="margin-top:6px"></div>`;
    }).join('');

    return `
      <div class="clock">${hhmm(now)}</div>
      <div class="date">${dateLabel(now)}</div>
      <button class="mode" data-action="go:#/ter">${terBullet(54)}
        <div class="grow"><div class="t">TER</div><div class="s">ARTENAY ⇄ ORLÉANS</div>
          <div class="l">${esc(line('→ ORLÉANS', a))}</div><div class="l">${esc(line('→ ARTENAY', o))}</div>
          ${ter.error ? `<div class="a">${esc(ter.error)}</div>` : terBad ? '<div class="a">Perturbations en cours</div>' : ''}
        </div><span class="arrow">→</span></button>
      <div class="gap"></div>
      <button class="mode" data-action="go:#/tao">${bullet('TAO', '#EE352E', '#fff', 54)}
        <div class="grow"><div class="t">BUS &amp; TRAM</div><div class="s">RÉSEAU TAO · MÉTROPOLE</div>
          <div class="l">${!ready ? 'Préparation des données…' : !tao.rt ? 'Horaires prévus' : disturbed ? `${disturbed} ligne${disturbed > 1 ? 's' : ''} perturbée${disturbed > 1 ? 's' : ''}` : 'Trafic normal'}</div>
          ${tao.rtAt ? `<div class="l muted">MAJ ${hhmm(new Date(tao.rtAt))}</div>` : ''}
          ${disturbed ? '<div class="a">Voir l\'info trafic</div>' : ''}
        </div><span class="arrow">→</span></button>
      <div class="gap"></div>
      <div class="panel">
        <div class="row-flex" style="padding:16px 18px 12px"><span style="color:var(--yellow);font-size:22px">★</span><span class="h2 grow">FAVORIS</span></div>
        <div class="colorbar" style="background:var(--yellow)"></div>
        ${favHtml}
      </div>`;
  },
};

// ═════════════════════════ TER ═════════════════════════
let terDir = null;
let terTrains = [];

export const TerView = {
  subs: [ter],
  attach: [ter],
  fab: () => ({ icon: 'swap', label: 'Inverser le sens', action: 'ter-swap' }),
  render() {
    if (terDir == null) terDir = Settings.cache('ter_dir') ?? (new Date().getHours() < 14 ? 0 : 1);
    const toOrl = terDir === 0;
    const board = toOrl ? ter.toOrleans : ter.toArtenay;
    const from = toOrl ? 'ARTENAY' : 'ORLÉANS', to = toOrl ? 'ORLÉANS' : 'ARTENAY';
    const dis = ter.disruptions;
    terTrains = board?.trains || [];
    let body;
    if (!board) body = ter.loading ? spinner() : empty('☁️', 'Horaires indisponibles');
    else if (!terTrains.length) body = empty('🌙', 'Aucun train dans les prochaines heures');
    else body = terTrains.map((t, i) => {
      const c = t.state === 'cancelled', d = t.state === 'delayed';
      return `<button class="train" data-action="train:${i}">
        <div class="time"><b class="${c ? 'muted strike' : d ? 't-red' : ''}">${hhmm(t.dep)}</b>${d ? `<s>${hhmm(t.baseDep)}</s>` : ''}</div>
        <div class="mid grow"><b class="ellipsis">→ ${esc((t.direction || 'TER').toUpperCase())}</b>
          <small>${esc(t.mode)} ${esc(t.number)} · arr. ${hhmm(t.arr)}</small> <span class="voie ${t.platformDep ? 'on' : ''}">VOIE ${esc(t.platformDep || '–')}</span>
          ${t.messages.length ? `<div class="msg ellipsis">${esc(t.messages[0])}</div>` : ''}</div>
        <div class="right">${terChip(t)}${c ? '' : `<small>${countdown(t.dep)}</small>`}</div>
      </button>`;
    }).join('');

    return `
      <div class="head">${terBullet(48)}<div class="grow"><div class="h2">ARTENAY ⇄ ORLÉANS</div>
        <div class="small muted">TER Centre-Val de Loire${ter.updatedAt ? ` · MAJ ${hhmm(new Date(ter.updatedAt))}` : ''}</div></div>
        <button class="iconbtn" data-action="ter-refresh" aria-label="Actualiser">${icon('refresh')}</button></div>
      <div class="seg"><button class="${toOrl ? 'on' : ''}" data-action="ter-dir:0">→ ORLÉANS</button><button class="${toOrl ? '' : 'on'}" data-action="ter-dir:1">→ ARTENAY</button></div>
      ${ter.error ? `<div class="gap"></div><div class="alert red">⚠️ ${esc(ter.error)}</div>` : ''}
      ${dis.length ? `<div class="gap"></div><button class="alert" data-action="ter-dis">⚠️ <span class="grow">${esc(dis[0].text)}</span>${dis.length > 1 ? chip('orange', '+' + (dis.length - 1)) : ''}<span class="chev">›</span></button>` : ''}
      <div class="gap"></div>
      <div class="panel"><div class="dirhead">${from} <span class="ar">→</span> ${to}</div><div class="colorbar" style="background:var(--ter)"></div>${body}</div>
      <p class="small muted" style="margin:10px 6px">Le numéro de voie n'est pas fourni par l'API SNCF : vérifiez-le sur les écrans en gare.</p>`;
  },
  action(a) {
    if (a === 'ter-swap') { terDir = terDir === 0 ? 1 : 0; Settings.cache('ter_dir', terDir); return true; }
    if (a.startsWith('ter-dir:')) { terDir = +a.split(':')[1]; Settings.cache('ter_dir', terDir); return true; }
    if (a === 'ter-refresh') { ter.refresh(true); return true; }
    if (a === 'ter-dis') { showDisruptions(); return true; }
    if (a.startsWith('train:')) { const t = terTrains[+a.split(':')[1]]; if (t) showTrain(t); return true; }
    return false;
  },
};

function showDisruptions() {
  openSheet(() => ({
    head: '<div class="h2">PERTURBATIONS TER</div>',
    body: ter.disruptions.map((d) => `<div class="panel pad" style="background:var(--raised);margin-bottom:10px">
      <div class="label" style="color:${d.effect === 'NO_SERVICE' ? 'var(--red)' : 'var(--orange)'}">${esc(d.title || 'Information')}</div>
      <p style="margin-top:6px">${esc(d.text)}</p></div>`).join(''),
  }));
}

function showTrain(t) {
  const stops = t.stops.map((s, i) => {
    const late = s.time && s.base && (s.time - s.base) / 60000 >= 1;
    return {
      name: s.name, time: s.time ? hhmm(s.time) : '', old: late ? hhmm(s.base) : '',
      timeClass: late ? 'c-red' : '',
      note: i === 0 || i === t.stops.length - 1 ? `VOIE ${s.platform || '– (affichée en gare)'}` : '',
      skip: t.state === 'cancelled',
    };
  });
  openSheet(() => ({
    head: `<div class="row-flex">${terBullet(46)}<div class="grow"><div class="h2">${esc(t.mode)} ${esc(t.number)}</div>
      <div class="small muted ellipsis">→ ${esc(t.direction.toUpperCase())}</div></div>${terChip(t)}</div>
      ${t.messages.map((m) => `<div class="alert" style="margin-top:10px;background:var(--raised)">ℹ️ <span>${esc(m)}</span></div>`).join('')}`,
    body: stops.length ? timeline(stops, 'var(--ter)') : empty('🛤️', 'Détail des arrêts indisponible'),
  }));
}

// ═════════════════════════ TAO : liste ═════════════════════════
let taoTab = 0;
let taoQuery = '';

export const TaoView = {
  subs: [tao],
  attach: [tao],
  mount(el) {
    el.innerHTML = `<div class="head">${bullet('TAO', '#EE352E', '#fff', 48)}<div class="grow"><div class="h2">RÉSEAU TAO</div>
      <div class="small muted" id="tao-status"></div></div></div>
      <div class="seg" id="tao-seg"></div><div class="gap"></div>
      <div id="tao-search" ${taoTab === 0 ? '' : 'hidden'}><input class="search" type="search" placeholder="Rechercher un arrêt" value="${esc(taoQuery)}" autocomplete="off"><div class="gap"></div></div>
      <div id="tao-list"></div>`;
    const input = el.querySelector('input');
    input.addEventListener('input', () => { taoQuery = input.value; this.update(el); });
    this.update(el);
  },
  update(el) {
    el.querySelector('#tao-status').textContent = tao.phase === 'ready' ? tao.statusLine : '';
    el.querySelector('#tao-seg').innerHTML = ['ARRÊTS', 'LIGNES', 'TRAFIC'].map((l, i) => `<button class="${i === taoTab ? 'on' : ''}" data-action="tao-tab:${i}">${l}</button>`).join('');
    el.querySelector('#tao-search').hidden = taoTab !== 0;
    el.querySelector('#tao-list').innerHTML = this.list();
  },
  list() {
    if (tao.phase === 'loading') return spinner();
    if (tao.phase === 'error') return `<div class="panel">${empty('⚠️', tao.error, '<button class="btn" data-action="tao-retry">RÉESSAYER</button>')}</div>`;
    if (taoTab === 0) {
      const q = norm(taoQuery);
      const favs = q ? [] : Favs.list().map((id) => tao.groupById.get(id)).filter(Boolean);
      const list = q ? tao.sortedGroups.filter((g) => norm(g.name).includes(q)) : tao.sortedGroups;
      if (!list.length) return `<div class="panel">${empty('🔍', 'Aucun arrêt trouvé')}</div>`;
      const item = (g, fav) => {
        const rs = tao.routesAt(g.idx);
        return `<button class="stopitem" data-action="go:#/arret/${esc(g.id)}">
          ${fav ? '<span class="star">★</span>' : '<span class="dotsm"></span>'}<span class="nm ellipsis">${esc(g.name)}</span>
          <span class="bl">${rs.slice(0, 4).map((r) => routeBullet(r, 22)).join('')}${rs.length > 4 ? `<span class="small muted" style="font-weight:800">+${rs.length - 4}</span>` : ''}</span></button>`;
      };
      const shown = list.slice(0, q ? 80 : 400);
      return `${favs.length ? `<div class="panel"><div class="secthead label y">Favoris</div>${favs.map((g) => item(g, true)).join('')}</div><div class="gap"></div>` : ''}
        <div class="panel">${!q && favs.length ? '<div class="secthead label">Tous les arrêts</div>' : ''}${shown.map((g) => item(g, Favs.has(g.id))).join('')}</div>`;
    }
    if (taoTab === 1) {
      const st = new Map(tao.lineStatuses().map((s) => [s.route.id, s]));
      return `<div class="panel">${tao.routesSorted.map((r) => {
        const s = st.get(r.id);
        return `<button class="lineitem" data-action="go:#/ligne/${r.idx}">${routeBullet(r, 38)}
          <span class="grow small" style="font-weight:700">${esc(r.long || 'Ligne ' + r.short)}</span>
          <span class="health" style="background:${s ? healthColor(s.health) : 'var(--dim)'}"></span><span class="chev">›</span></button>`;
      }).join('')}</div>`;
    }
    // Trafic
    if (!tao.rt) return `<div class="panel pad"><div class="label y">Temps réel indisponible</div><p class="small muted" style="margin-top:6px">${esc(tao.rtDetail || 'Connexion en cours…')}</p></div>`;
    const sts = tao.lineStatuses();
    const bad = sts.filter((s) => s.health !== 'ok').length;
    return `<div class="alert" style="border-color:${bad ? 'var(--orange)' : 'var(--green)'}">${bad ? `${bad} ligne${bad > 1 ? 's' : ''} perturbée${bad > 1 ? 's' : ''}` : 'Trafic normal sur l\'ensemble du réseau'}</div><div class="gap"></div>
      <div class="panel">${sts.map((s) => `<button class="lineitem" data-action="go:#/ligne/${s.route.idx}">${routeBullet(s.route, 36)}
        <span class="grow"><b style="color:${healthColor(s.health)};font-size:14px">${esc(s.title)}</b><br><span class="small muted">${esc(s.detail)}</span></span><span class="chev">›</span></button>`).join('')}</div>
      <p class="small muted" style="margin:10px 6px">État calculé à partir du temps réel TAO (suppressions, arrêts non desservis, retards).</p>`;
  },
  action(a, el) {
    if (a.startsWith('tao-tab:')) { taoTab = +a.split(':')[1]; this.update(el); return true; }
    if (a === 'tao-retry') { tao.phase = 'loading'; tao.emit(); tao.init(); return true; }
    return false;
  },
};

export const healthColor = (h) => ({ ok: 'var(--green)', delays: 'var(--orange)', deviation: 'var(--orange)', cancel: 'var(--red)' }[h]);

// ═════════════════════════ TAO : arrêt ═════════════════════════
let boardDeps = [];

function boardRow(row, gIdx, cells = 3, compact = false) {
  const i = boardDeps.push(row.next[0]) - 1;
  boardDeps[i]._g = gIdx;
  return `<button class="brow" data-action="dep:${i}">${routeBullet(row.route, compact ? 34 : 42)}
    <span class="grow"><span class="dest ellipsis" style="display:block">→ ${esc(row.dest.toUpperCase())}</span>
      ${!compact && row.route.long ? `<span class="sub ellipsis" style="display:block">${esc(row.route.long)}</span>` : ''}</span>
    <span class="cells">${row.next.slice(0, cells).map((d, k) => {
      const sub = d.cancelled ? `<s>${hhmm(d.time)}</s>` : d.theoretical ? `${hhmm(d.time)} théo.` : d.delay >= 1 ? `${hhmm(d.time)} +${d.delay}` : hhmm(d.time);
      return `<span class="cell ${k === 0 && !compact ? 'first' : ''}"><b class="${delayClass(d)}">${d.cancelled ? 'SUPPR.' : countdown(d.time)}</b><small>${sub}</small></span>`;
    }).join('')}</span></button>`;
}

export const StopView = {
  subs: [tao],
  attach: [tao],
  render(params) {
    boardDeps = [];
    if (tao.phase !== 'ready') return tao.phase === 'error' ? empty('⚠️', tao.error) : spinner();
    const g = tao.groupById.get(params[0]);
    if (!g) return backHead('Arrêt introuvable') + empty('📍', 'Cet arrêt n\'existe plus dans les données TAO.');
    const fav = Favs.has(g.id);
    const rows = tao.board(g.idx, 3);
    const routes = tao.routesAt(g.idx);
    return `${backHead(esc(g.name.toUpperCase()), esc(tao.statusLine),
      `<button class="iconbtn ${fav ? 'fav' : ''}" data-action="fav:${esc(g.id)}" aria-label="Favori">${icon(fav ? 'star' : 'starO')}</button>`)}
      <div class="row-flex" style="flex-wrap:wrap;gap:5px;margin:-4px 0 12px 52px">${routes.map((r) => `<button data-action="go:#/ligne/${r.idx}">${routeBullet(r, 26)}</button>`).join('')}</div>
      ${tao.rtError ? `<div class="alert" style="margin-bottom:12px">⚠️ <span class="grow small">${esc(tao.rtError)} : horaires prévus affichés.</span></div>` : ''}
      <div class="panel">${rows.length ? rows.map((r) => boardRow(r, g.idx, 2)).join('') : empty('🕒', 'Aucun passage dans les 4 prochaines heures')}</div>
      <p class="small muted" style="margin:10px 6px">Vert : à l'heure · Rouge : retard ou suppression · Blanc « théo. » : horaire prévu.</p>`;
  },
  fab: () => ({ icon: 'refresh', label: 'Actualiser', action: 'tao-refresh', busy: tao._busy }),
  action(a) {
    if (a.startsWith('fav:')) { Favs.toggle(a.slice(4)); return true; }
    if (a === 'tao-refresh') { tao.refreshRt(true); return true; }
    return false;
  },
};

export function handleDep(i) {
  const d = boardDeps[+i];
  if (d) showTrip(d, d._g);
}

function showTrip(d, gIdx) {
  const stops = tao.tripDetail(d);
  let focus = stops.findIndex((s) => s.g === gIdx);
  const tl = stops.map((s, i) => ({
    name: s.name, time: s.time ? hhmm(s.time) : '',
    timeClass: s.delay == null ? '' : s.delay >= 2 ? 'c-red' : 'c-green',
    note: s.skipped ? 'NON DESSERVI' : d.theoretical ? '' : s.delay == null ? '' : s.delay >= 1 ? `+${s.delay} MIN` : s.delay <= -1 ? `${s.delay} MIN` : "À L'HEURE",
    noteClass: s.skipped || (s.delay ?? 0) >= 2 ? 'c-red' : 'c-green',
    hl: i === focus, skip: s.skipped,
    action: s.g != null && s.g !== gIdx ? `go:#/arret/${tao.groups[s.g].id}` : '',
  }));
  const tag = d.rt?.cancelled ? chip('red', 'SUPPRIMÉ') : d.rt?.partly ? chip('orange', 'DÉVIATION') : d.theoretical ? chip('grey', 'THÉORIQUE') : '';
  const { sheet } = openSheet(() => ({
    head: `<div class="row-flex">${routeBullet(d.route, 46)}<div class="grow"><div class="h2 ellipsis">→ ${esc(d.dest.toUpperCase())}</div>
      <div class="small muted ellipsis">${esc(d.route.long || 'Ligne ' + d.route.short)}</div></div>${tag}</div>
      ${d.theoretical ? '<p class="small muted" style="margin-top:8px">Course non suivie en temps réel : horaires prévus par TAO.</p>' : ''}`,
    body: timeline(tl, d.route.color),
  }));
  const hl = sheet.querySelector('[data-hl]');
  if (hl) sheet.querySelector('.sh-body').scrollTop = Math.max(0, hl.offsetTop - 80);
}

// ═════════════════════════ TAO : ligne ═════════════════════════
const lineDir = new Map();

export const LineView = {
  subs: [tao],
  attach: [tao],
  render(params) {
    if (tao.phase !== 'ready') return spinner();
    const r = tao.routes[+params[0]];
    if (!r) return backHead('Ligne introuvable');
    const dirs = tao.directions(r.idx);
    let d = lineDir.get(r.idx) ?? dirs[0]?.dir ?? 0;
    if (dirs.length && !dirs.some((x) => x.dir === d)) d = dirs[0].dir;
    const st = tao.lineStatuses().find((s) => s.route.id === r.id);
    const rows = tao.lineStops(r.idx, d);
    return `<div class="head"><button class="back" data-action="back" aria-label="Retour">${icon('back')}</button>${routeBullet(r, 50)}
      <div class="grow"><div class="h2" style="font-size:17px;line-height:1.15">${esc((r.long || 'Ligne ' + r.short).toUpperCase())}</div>
      ${st ? `<div class="small" style="color:${healthColor(st.health)};font-weight:800">${esc(st.title)}</div>` : ''}</div></div>
      ${dirs.length > 1 ? `<div class="seg">${dirs.map((x) => `<button class="${x.dir === d ? 'on' : ''}" data-action="line-dir:${r.idx}:${x.dir}">→ ${esc(x.terminus.toUpperCase())}</button>`).join('')}</div><div class="gap"></div>` : ''}
      <div class="panel" style="padding:6px 14px 6px 8px">${rows.length ? timeline(rows.map((s) => ({
        name: s.name,
        time: s.next ? countdown(fromEpoch(s.next.t)) : s.skipped ? 'NON DESSERVI' : '—',
        timeClass: s.next ? (s.next.delay >= 2 ? 'c-red' : s.next.theo ? 'c-theo' : '') : s.skipped ? 'c-red' : 'muted',
        note: s.next ? `${s.next.theo ? 'PRÉVU' : 'PROCHAIN'} ${hhmm(fromEpoch(s.next.t))}${s.next.delay >= 1 ? ` · +${s.next.delay} MIN` : ''}` : '',
        skip: s.skipped,
        action: s.g != null ? `go:#/arret/${tao.groups[s.g].id}` : '',
      })), r.color) : empty('🕒', 'Aucune donnée pour cette ligne')}</div>
      <div class="gap"></div><button class="btn dark" data-action="map-line:${r.idx}" style="width:100%">VOIR SUR LA CARTE</button>`;
  },
  action(a) {
    if (a.startsWith('line-dir:')) { const [, ri, d] = a.split(':'); lineDir.set(+ri, +d); return true; }
    if (a.startsWith('map-line:')) { MapView.focusRoute = +a.split(':')[1]; go('#/carte'); return true; }
    return false;
  },
};

// ═════════════════════════ CARTE ═════════════════════════
export const MapView = {
  full: true,
  subs: [tao],
  attach: [tao],
  focusRoute: null,
  map: null,
  mount(el) {
    el.innerHTML = `<div id="map"></div>
      <div class="map-top"><div class="row-flex"><span class="h2 grow" style="font-size:16px">PLAN DU RÉSEAU</span>
        <div class="seg" id="map-filter" style="width:150px"></div></div><div class="lines" id="map-lines"></div></div>
      <div class="map-ctrl"><button class="big" data-action="map-zoom:1">+</button><button class="big" data-action="map-zoom:-1">−</button>
        <button data-action="map-goto:orl">ORL</button><button data-action="map-goto:art">ART</button></div>
      <div class="map-attr">© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> · © <a href="https://carto.com/attributions" target="_blank">CARTO</a></div>`;
    if (!window.L) { el.querySelector('#map').innerHTML = empty('🗺️', 'Bibliothèque de carte non chargée (connexion ?)'); return; }
    this.showTram = this.showTram ?? true;
    this.showBus = this.showBus ?? true;
    const m = L.map(el.querySelector('#map'), { zoomControl: false, attributionControl: false, minZoom: 8, maxZoom: 18 })
      .setView([47.9029, 1.9093], 12.3);
    L.tileLayer(cartoTiles(), { maxZoom: 19, subdomains: 'abcd', detectRetina: false }).addTo(m);
    this.map = m;
    this.lineLayer = L.layerGroup().addTo(m);
    this.stopLayer = L.layerGroup().addTo(m);
    this.terLayer = L.layerGroup().addTo(m);
    m.on('zoomend', () => this.drawStops());
    tao.loadShapes().then(() => { if (this.map === m) { this.draw(); if (this.focusRoute != null) this.fitRoute(this.focusRoute); } });
    this.draw();
  },
  unmount() { this.map?.remove(); this.map = null; },
  update() { this.draw(); },
  draw() {
    if (!this.map) return;
    const el = this.map.getContainer().parentElement;
    el.querySelector('#map-filter').innerHTML = this.focusRoute != null
      ? '<button class="on" data-action="map-all">TOUT ✕</button>'
      : `<button class="${this.showTram ? 'on' : ''}" data-action="map-tram">TRAM</button><button class="${this.showBus ? 'on' : ''}" data-action="map-bus">BUS</button>`;
    const routes = tao.phase === 'ready' ? tao.routesSorted : [];
    el.querySelector('#map-lines').innerHTML = routes.map((r) => `<button data-action="map-line:${r.idx}" style="opacity:${this.focusRoute == null || this.focusRoute === r.idx ? 1 : 0.3}">${routeBullet(r, 32)}</button>`).join('');
    this.drawLines();
    this.drawStops();
    this.drawTer();
  },
  drawLines() {
    this.lineLayer.clearLayers();
    const shapes = tao.shapes;
    if (!shapes || tao.phase !== 'ready') return;
    const order = Object.keys(shapes).map(Number).sort((a, b) => {
      const rank = (i) => (i === this.focusRoute ? 2 : tao.routes[i]?.tram ? 1 : 0);
      return rank(a) - rank(b);
    });
    for (const ri of order) {
      const r = tao.routes[ri];
      if (!r) continue;
      if (this.focusRoute == null && ((r.tram && !this.showTram) || (!r.tram && !this.showBus))) continue;
      const sel = this.focusRoute === ri, dim = this.focusRoute != null && !sel;
      for (const flat of shapes[ri]) {
        const pts = [];
        for (let i = 0; i + 1 < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
        if (pts.length < 2) continue;
        if (!dim) L.polyline(pts, { color: '#000', weight: (sel ? 7 : r.tram ? 5 : 3) + 3, opacity: 1, interactive: false }).addTo(this.lineLayer);
        L.polyline(pts, { color: r.color, weight: sel ? 7 : r.tram ? 5 : 3, opacity: dim ? 0.18 : 1, interactive: false }).addTo(this.lineLayer);
      }
    }
  },
  drawStops() {
    if (!this.map || tao.phase !== 'ready') return;
    this.stopLayer.clearLayers();
    const z = this.map.getZoom();
    const only = this.focusRoute != null ? new Set(tao.groups.filter((g) => g.routes.includes(this.focusRoute)).map((g) => g.idx)) : null;
    const rc = this.focusRoute != null ? tao.routes[this.focusRoute].color : '#000';
    for (const g of tao.groups) {
      if (!g.lat) continue;
      const fav = Favs.has(g.id);
      if (only) { if (!only.has(g.idx)) continue; } else if (!fav) {
        if (g.tram && !this.showTram) continue;
        if (!g.tram && !this.showBus) continue;
        if (!g.tram && z < 13.3) continue;
      }
      const big = fav || g.tram || only;
      L.circleMarker([g.lat, g.lon], {
        radius: fav ? 9 : big ? 6.5 : 5, color: only ? rc : '#000', weight: big ? 4 : 3,
        fillColor: fav ? '#FFCC00' : '#fff', fillOpacity: 1,
      }).on('click', () => showStopSheet(g)).addTo(this.stopLayer);
    }
  },
  drawTer() {
    this.terLayer.clearLayers();
    const pts = [
      ter.artenay?.lat ? [ter.artenay.lat, ter.artenay.lon] : [48.0815, 1.8860],
      ter.orleans?.lat ? [ter.orleans.lat, ter.orleans.lon] : [47.9078, 1.9047],
    ];
    for (const p of pts) {
      L.marker(p, { icon: L.divIcon({ className: 'ter-pin', html: terBullet(36), iconSize: [36, 36] }) })
        .on('click', () => go('#/ter')).addTo(this.terLayer);
    }
  },
  fitRoute(ri) {
    const flat = (tao.shapes?.[ri] || []).flat();
    const pts = [];
    for (let i = 0; i + 1 < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
    if (pts.length < 2) for (const g of tao.groups) if (g.routes.includes(ri) && g.lat) pts.push([g.lat, g.lon]);
    if (pts.length >= 2) this.map.fitBounds(pts, { paddingTopLeft: [20, 130], paddingBottomRight: [70, 30] });
  },
  action(a) {
    if (!this.map) return false;
    if (a.startsWith('map-zoom:')) { this.map.setZoom(this.map.getZoom() + +a.split(':')[1]); return true; }
    if (a === 'map-goto:orl') { this.map.setView([47.9029, 1.9093], 12.6); return true; }
    if (a === 'map-goto:art') { this.map.setView([48.0815, 1.886], 14.5); return true; }
    if (a === 'map-tram') { this.showTram = !this.showTram; this.draw(); return true; }
    if (a === 'map-bus') { this.showBus = !this.showBus; this.draw(); return true; }
    if (a === 'map-all') { this.focusRoute = null; this.draw(); return true; }
    if (a.startsWith('map-line:')) {
      const ri = +a.split(':')[1];
      this.focusRoute = this.focusRoute === ri ? null : ri;
      this.draw();
      if (this.focusRoute != null) this.fitRoute(ri);
      return true;
    }
    return false;
  },
};

function showStopSheet(g) {
  openSheet(() => {
    boardDeps = [];
    const rows = tao.board(g.idx, 2).slice(0, 8);
    const fav = Favs.has(g.id);
    return {
      head: `<div class="row-flex"><div class="grow"><div class="h2 ellipsis">${esc(g.name.toUpperCase())}</div>
        <div class="row-flex" style="gap:4px;flex-wrap:wrap;margin-top:6px">${tao.routesAt(g.idx).map((r) => routeBullet(r, 24)).join('')}</div></div>
        <button class="iconbtn ${fav ? 'fav' : ''}" data-action="fav-sheet:${esc(g.id)}">${icon(fav ? 'star' : 'starO')}</button>
        <button class="btn" data-action="go:#/arret/${esc(g.id)}">OUVRIR</button></div>`,
      body: rows.length ? rows.map((r) => boardRow(r, g.idx, 2, true)).join('') : empty('🕒', 'Aucun passage dans les 4 prochaines heures'),
    };
  }, { onClose: () => window.dispatchEvent(new Event('ot-rerender')) });
}

// ═════════════════════════ RÉGLAGES ═════════════════════════
export const SettingsView = {
  subs: [tao, ter],
  mount(el) {
    el.innerHTML = `<div class="h1" style="margin-bottom:14px">RÉGLAGES</div>
      <div class="panel">
        <div class="set-row"><div class="label y">Clé API SNCF</div>
          <p class="small muted" style="margin:6px 0 10px">Gardée uniquement dans ce navigateur. Inutile si un proxy est configuré.</p>
          <input class="field" id="k-sncf" type="password" autocomplete="off" placeholder="Clé api.sncf.com"></div>
        <div class="set-row"><div class="label y">Clé CARTO (fond de carte)</div>
          <p class="small muted" style="margin:6px 0 10px" id="carto-info"></p>
          <input class="field" id="k-carto" type="password" autocomplete="off" placeholder="Laisser vide = clé du site"></div>
        <div class="set-row"><div class="label y">Proxy (optionnel)</div>
          <p class="small muted" style="margin:6px 0 10px">Adresse de votre worker Cloudflare, si le navigateur bloque les données (voir le guide).</p>
          <input class="field" id="k-proxy" type="url" autocomplete="off" placeholder="https://….workers.dev"></div>
        <div class="set-row row-flex"><label class="row-flex small grow" style="gap:8px"><input type="checkbox" id="k-show"> Afficher les clés</label>
          <button class="btn" data-action="save-keys">ENREGISTRER</button></div>
      </div>
      <div class="gap"></div>
      <div class="panel" id="diag"></div>
      <div class="gap"></div>
      <div class="panel pad"><div class="label y">Installer sur l'écran d'accueil</div>
        <p class="small" style="margin-top:8px;line-height:1.5"><b>iPhone (Safari)</b> : bouton Partager → <b>Sur l'écran d'accueil</b>.<br>
        <b>Android (Chrome)</b> : menu ⋮ → <b>Ajouter à l'écran d'accueil</b> / <b>Installer l'application</b>.</p></div>
      <div class="gap"></div>
      <div class="panel pad"><div class="label y">À propos des données</div>
        <p class="small muted" style="margin-top:8px;line-height:1.5">• TER : API SNCF (moteur Navitia). La voie n'est pas fournie par l'API.<br>
        • TAO : données ouvertes d'Orléans Métropole / Keolis Métropole Orléans (GTFS et GTFS-RT, Licence Ouverte 2.0), via transport.data.gouv.fr. Retards calculés en comparant temps réel et horaires prévus.<br>
        • Carte : © OpenStreetMap contributors, © CARTO.<br>
        Application personnelle, non affiliée à la SNCF, à TAO ni à Keolis.</p></div>`;
    el.querySelector('#k-sncf').value = Settings.sncfKey;
    el.querySelector('#k-carto').value = localStorage.getItem('ot_carto_key') || '';
    el.querySelector('#k-proxy').value = localStorage.getItem('ot_proxy') || '';
    el.querySelector('#carto-info').textContent = Settings.hasBuildCarto ? 'Une clé est intégrée au site ; vous pouvez la remplacer.' : 'Sans clé, la carte affiche un filigrane CARTO.';
    el.querySelector('#k-show').addEventListener('change', (e) => {
      for (const id of ['#k-sncf', '#k-carto']) el.querySelector(id).type = e.target.checked ? 'text' : 'password';
    });
    this.update(el);
  },
  update(el) {
    const d = el.querySelector('#diag');
    if (!d) return;
    const okT = tao.rtAt && !tao.rtError;
    const okS = ter.updatedAt && !ter.error;
    const meta = tao.meta;
    d.innerHTML = `<div class="set-row"><div class="label y">Diagnostic</div>
      <div class="kv"><span>Temps réel TAO</span><span style="color:${okT ? 'var(--green)' : 'var(--red)'};font-weight:800;text-align:right">${okT ? `OK · ${tao.rt.trips.size} courses` : esc(tao.rtDetail || 'pas encore chargé')}</span></div>
      <div class="kv"><span>TER (SNCF)</span><span style="color:${okS ? 'var(--green)' : 'var(--red)'};font-weight:800;text-align:right">${okS ? 'OK' : esc(ter.error || 'pas encore chargé')}</span></div>
      <div class="kv"><span>Horaires TAO</span><span style="text-align:right">${meta ? `générés le ${esc(new Date(meta.generated).toLocaleDateString('fr-FR'))} à ${esc(hhmm(new Date(meta.generated)))}${tao.trips?.size ? '' : ' · <span style="color:var(--orange)">pas d\'horaires pour aujourd\'hui</span>'}` : esc(tao.error || '…')}</span></div>
      <div class="kv"><span>Proxy</span><span>${Settings.proxy ? 'activé' : 'non'}</span></div>
      <div style="margin-top:10px"><button class="btn dark" data-action="diag-test">TESTER</button></div></div>`;
  },
  action(a, el) {
    if (a === 'save-keys') {
      Settings.sncfKey = el.querySelector('#k-sncf').value;
      Settings.cartoKey = el.querySelector('#k-carto').value;
      Settings.proxy = el.querySelector('#k-proxy').value;
      ter.resetStations();
      toast('Réglages enregistrés');
      ter.refresh(true);
      tao.refreshRt(true);
      return true;
    }
    if (a === 'diag-test') { ter.refresh(true); tao.refreshRt(true); toast('Test en cours…'); return true; }
    return false;
  },
};

export { closeSheet, redrawSheet, sheetOpen, compareRoutes };
