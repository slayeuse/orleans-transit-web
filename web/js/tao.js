// Réseau TAO : données préparées (horaires prévus) + temps réel GTFS-RT.
import { Settings, URLS } from './config.js';
import { decodeFeed } from './gtfsrt.js';
import { Emitter, fetchWithTimeout, fromEpoch, hhmm, midnight, nowSec, visible, ymd } from './util.js';

async function getJson(name) {
  const r = await fetchWithTimeout(`${URLS.data}/${name}`, { cache: 'no-cache' }, 30000);
  if (!r.ok) throw new Error(`${name} : HTTP ${r.status}`);
  return r.json();
}

/** Tri : tram d'abord, puis lettres, puis numéros. */
export function compareRoutes(a, b) {
  if (a.tram !== b.tram) return a.tram ? -1 : 1;
  const na = parseInt(a.short, 10), nb = parseInt(b.short, 10);
  const ia = String(na) === a.short, ib = String(nb) === b.short;
  if (ia && ib) return na - nb;
  if (ia) return 1;
  if (ib) return -1;
  return a.short.localeCompare(b.short, 'fr');
}

class TaoRepo extends Emitter {
  constructor() {
    super();
    this.phase = 'loading'; // loading | ready | error
    this.error = null;
    this.meta = null;
    this.routes = [];
    this.stops = [];
    this.groups = [];
    this.lines = {};
    this.shapes = null;
    this.day = null; // AAAAMMJJ chargé
    this.rt = null;
    this.rtAt = null;
    this.rtError = null;
    this.rtDetail = null;
    this._busy = false;
    this._users = 0;
    this._timer = null;
  }

  // ───────────── chargement ─────────────

  async init() {
    try {
      const [meta, routes, stops, groups, lines] = await Promise.all([
        getJson('meta.json'), getJson('routes.json'), getJson('stops.json'),
        getJson('groups.json'), getJson('lines.json'),
      ]);
      this.meta = meta;
      this.routes = routes;
      this.routeById = new Map(routes.map((r, i) => { r.idx = i; return [r.id, r]; }));
      this.stops = stops; // [id, nom, groupe]
      this.stopById = new Map(stops.map((s, i) => [s[0], i]));
      this.groups = groups.map((g, i) => ({ ...g, idx: i, stopSet: new Set(g.stops) }));
      this.groupById = new Map(this.groups.map((g) => [g.id, g]));
      this.sortedGroups = [...this.groups].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      this.lines = lines;
      try { await this._loadDay(); } catch (_) { /* temps réel seul */ }
      this.phase = 'ready';
      this.emit();
      this.refreshRt(true);
    } catch (e) {
      this.phase = 'error';
      this.error = `Données TAO indisponibles (${e.message || e}).`;
      this.emit();
    }
  }

  async _loadDay() {
    const today = ymd();
    if (this.day === today) return;
    const days = this.meta?.days || [];
    this.trips = new Map(); // id complet -> [course prévue, …]
    this.byGroup = new Map(); // idx groupe -> [{trip, pos}]
    this.day = today;
    if (!days.includes(today)) return; // données trop anciennes : temps réel seul
    const raw = await getJson(`day-${today}.json`);
    const mid = midnight();
    const prefix = this.meta.tripPrefix || '';
    for (const [short, ri, dir, stopIdx, deltas, shifted] of raw) {
      const secs = [];
      let acc = 0;
      for (let i = 0; i < deltas.length; i++) { acc = i === 0 ? deltas[0] : acc + deltas[i]; secs.push(mid + acc); }
      const trip = { id: prefix + short, ri, dir, stops: stopIdx, times: secs, shifted: !!shifted };
      const list = this.trips.get(trip.id);
      if (list) list.push(trip); else this.trips.set(trip.id, [trip]);
      for (let p = 0; p < stopIdx.length - 1; p++) { // terminus exclu
        const g = this.stops[stopIdx[p]]?.[2];
        if (g == null) continue;
        let arr = this.byGroup.get(g);
        if (!arr) this.byGroup.set(g, (arr = []));
        arr.push({ trip, pos: p });
      }
    }
    for (const arr of this.byGroup.values()) arr.sort((a, b) => a.trip.times[a.pos] - b.trip.times[b.pos]);
  }

  async loadShapes() {
    if (this.shapes) return this.shapes;
    try { this.shapes = await getJson('shapes.json'); } catch (_) { this.shapes = {}; }
    this.emit();
    return this.shapes;
  }

  // ───────────── temps réel ─────────────

  attach() {
    this._users++;
    if (this._users === 1) {
      this.refreshRt();
      this._timer = setInterval(() => { if (visible()) this.refreshRt(); }, 45000);
    }
    return () => this.detach();
  }

  detach() {
    this._users = Math.max(0, this._users - 1);
    if (this._users === 0) { clearInterval(this._timer); this._timer = null; }
  }

  async refreshRt(force = false) {
    if (this.phase !== 'ready' || this._busy) return;
    if (!force && this.rtAt && Date.now() - this.rtAt < 15000) return;
    this._busy = true;
    if (this.day !== ymd()) { try { await this._loadDay(); } catch (_) { /* ignore */ } }
    const proxy = Settings.proxy;
    const url = proxy ? `${proxy}/tao-rt` : URLS.taoRt;
    try {
      let r;
      try {
        r = await fetchWithTimeout(url, { cache: 'no-store' }, 30000);
      } catch (e) {
        throw new Error(e.name === 'AbortError' ? 'délai dépassé'
          : (proxy ? 'proxy injoignable' : 'bloqué par le navigateur (CORS) : configurez le proxy dans Réglages'));
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (!bytes.length) throw new Error('réponse vide');
      const feed = decodeFeed(bytes);
      if (!feed.trips.size) {
        const head = [...bytes.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
        throw new Error(`flux sans course · ${bytes.length} o · ${head}`);
      }
      this._applyFeed(feed);
      this.rtError = null;
      this.rtDetail = null;
      this.rtAt = Date.now();
    } catch (e) {
      this.rtError = 'Temps réel TAO indisponible';
      this.rtDetail = String(e.message || e).slice(0, 160);
    }
    this._busy = false;
    this.emit();
  }

  _applyFeed(feed) {
    this.rt = feed;
    this.rtByGroup = new Map();
    for (const t of feed.trips.values()) {
      t.route = this.routeOf(t.routeId);
      for (const s of t.stus) {
        const si = this.stopById.get(s.stopId);
        s.si = si;
        const g = si == null ? null : this.stops[si][2];
        s.g = g;
        if (g == null) continue;
        let arr = this.rtByGroup.get(g);
        if (!arr) this.rtByGroup.set(g, (arr = []));
        arr.push({ t, s });
      }
    }
  }

  // ───────────── aides ─────────────

  routeOf(id) {
    return this.routeById?.get(id) || { id, short: String(id).split(':').pop(), long: '', color: '#8E8E93', text: '#FFFFFF', tram: false, idx: -1 };
  }

  stopName(si) { return si == null ? '' : (this.stops[si]?.[1] || ''); }
  stopNameById(id) { const si = this.stopById.get(id); return si == null ? String(id).split(':').pop() : this.stops[si][1]; }

  /** Position d'un arrêt temps réel dans une course prévue. */
  _pos(trip, s) {
    if (s.si != null) {
      const p = trip.stops.indexOf(s.si);
      if (p >= 0) return p;
    }
    if (s.seq >= 1 && s.seq <= trip.stops.length) return s.seq - 1;
    return -1;
  }

  /** Retard en minutes (positif = en retard) ou null. */
  delayOf(t, s) {
    const explicit = s.depDelay ?? s.arrDelay;
    if (explicit != null) return Math.round(explicit / 60);
    const cands = this.trips?.get(t.id);
    if (!cands || !s.t) return null;
    let best = null;
    for (const trip of cands) {
      const p = this._pos(trip, s);
      if (p < 0) continue;
      const diff = s.t - trip.times[p];
      if (best == null || Math.abs(diff) < Math.abs(best)) best = diff;
    }
    if (best == null) return null;
    const m = Math.round(best / 60);
    return m < -20 || m > 120 ? null : m;
  }

  // ───────────── requêtes pour l'interface ─────────────

  departures(gIdx, limit = 80) {
    const now = nowSec() - 30;
    const g = this.groups[gIdx];
    if (!g) return [];
    const out = [];
    const seen = new Set();
    const rtTrips = this.rt?.trips;

    for (const { trip, pos } of this.byGroup?.get(gIdx) || []) {
      const sched = trip.times[pos];
      if (sched < now - 3 * 3600) continue;
      if (sched > now + 4 * 3600) break;
      const rt = rtTrips?.get(trip.id);
      if (rt) {
        const s = rt.stus.find((x) => x.g === gIdx) || rt.stus.find((x) => x.seq === pos + 1);
        if (s && s.t && Math.abs(s.t - sched) < 3 * 3600) {
          seen.add(trip.id);
          if (s.t >= now && s !== rt.stus[rt.stus.length - 1]) out.push(this._fromRt(rt, s));
          continue;
        }
      }
      if (sched < now || seen.has(trip.id)) continue;
      seen.add(trip.id);
      const last = trip.stops[trip.stops.length - 1];
      out.push({
        route: this.routes[trip.ri], dest: this.stopName(last), time: fromEpoch(sched),
        delay: null, cancelled: false, theoretical: true, trip, pos,
      });
    }
    for (const { t, s } of this.rtByGroup?.get(gIdx) || []) {
      if (seen.has(t.id) || !s.t || s.t < now) continue;
      if (s === t.stus[t.stus.length - 1]) continue;
      seen.add(t.id);
      out.push(this._fromRt(t, s));
    }
    out.sort((a, b) => a.time - b.time);
    return out.slice(0, limit);
  }

  _fromRt(t, s) {
    const last = t.stus[t.stus.length - 1];
    return {
      route: t.route, dest: this.stopNameById(last?.stopId), time: fromEpoch(s.t),
      delay: this.delayOf(t, s), cancelled: t.cancelled || s.skipped, theoretical: false, rt: t, s,
    };
  }

  board(gIdx, perRow = 3) {
    const rows = new Map();
    for (const d of this.departures(gIdx)) {
      const k = d.route.id + '|' + d.dest;
      let row = rows.get(k);
      if (!row) rows.set(k, (row = { route: d.route, dest: d.dest, next: [] }));
      if (row.next.length < perRow) row.next.push(d);
    }
    return [...rows.values()].sort((a, b) => compareRoutes(a.route, b.route) || a.dest.localeCompare(b.dest, 'fr'));
  }

  routesAt(gIdx) {
    const g = this.groups[gIdx];
    const set = new Set(g?.routes || []);
    for (const { t } of this.rtByGroup?.get(gIdx) || []) if (t.route.idx >= 0) set.add(t.route.idx);
    return [...set].map((i) => this.routes[i]).filter(Boolean).sort(compareRoutes);
  }

  get routesSorted() { return [...this.routes].sort(compareRoutes); }

  /** Sens d'une ligne : [{dir, terminus}] */
  directions(ri) {
    const l = this.lines[String(ri)] || {};
    return Object.keys(l).sort().map((d) => ({ dir: +d, terminus: this.stopName(l[d][l[d].length - 1]) }));
  }

  /** Arrêts d'une ligne dans un sens avec prochain passage. */
  lineStops(ri, dir) {
    const pattern = (this.lines[String(ri)] || {})[String(dir)] || [];
    const now = nowSec();
    const next = new Map(); // si -> {t, delay, theo}
    const skipped = new Set();
    const route = this.routes[ri];
    for (const t of this.rt?.trips.values() || []) {
      if (t.route !== route || t.dir !== dir) continue;
      for (const s of t.stus) {
        if (s.si == null || !s.t || s.t < now) continue;
        if (t.cancelled || s.skipped) { if (s.t < now + 3600) skipped.add(s.si); continue; }
        const cur = next.get(s.si);
        if (!cur || s.t < cur.t) next.set(s.si, { t: s.t, delay: this.delayOf(t, s), theo: false });
      }
    }
    for (const list of this.trips?.values() || []) {
      for (const trip of list) {
        if (trip.ri !== ri || trip.dir !== dir) continue;
        if (this.rt?.trips.has(trip.id)) continue;
        trip.stops.forEach((si, p) => {
          const t = trip.times[p];
          if (t < now) return;
          const cur = next.get(si);
          if (!cur || t < cur.t) next.set(si, { t, delay: null, theo: true });
        });
      }
    }
    return pattern.map((si) => ({
      si, name: this.stopName(si), g: this.stops[si]?.[2],
      next: next.get(si) || null,
      skipped: !next.has(si) && skipped.has(si),
    }));
  }

  /** Détail d'une course : [{name, time, delay, skipped, g}] */
  tripDetail(d) {
    if (d.rt) {
      return d.rt.stus.map((s) => ({
        name: this.stopNameById(s.stopId), time: s.t ? fromEpoch(s.t) : null,
        delay: this.delayOf(d.rt, s), skipped: s.skipped || d.rt.cancelled, g: s.g,
      }));
    }
    return d.trip.stops.map((si, p) => ({
      name: this.stopName(si), time: fromEpoch(d.trip.times[p]), delay: null, skipped: false, g: this.stops[si]?.[2],
    }));
  }

  lineStatuses() {
    if (!this.rt) return [];
    const now = nowSec();
    const acc = new Map();
    for (const t of this.rt.trips.values()) {
      if (!t.stus.length || t.stus[t.stus.length - 1].t < now) continue;
      let a = acc.get(t.route.id);
      if (!a) acc.set(t.route.id, (a = { route: t.route, trips: 0, cancelled: 0, deviated: 0, sum: 0, n: 0 }));
      a.trips++;
      if (t.cancelled) { if (t.stus[0].t < now + 3 * 3600) a.cancelled++; continue; }
      if (t.partly) a.deviated++;
      for (const s of t.stus) {
        if (s.t < now - 300 || s.t > now + 1800) continue;
        const d = this.delayOf(t, s);
        if (d != null) { a.sum += d; a.n++; }
      }
    }
    const out = [];
    for (const a of acc.values()) {
      const avg = a.n ? a.sum / a.n : null;
      let health = 'ok';
      if (a.cancelled) health = 'cancel';
      else if (a.deviated) health = 'deviation';
      else if (avg != null && avg >= 4) health = 'delays';
      const title = {
        cancel: a.cancelled === 1 ? '1 passage supprimé' : `${a.cancelled} passages supprimés`,
        deviation: 'Arrêts non desservis',
        delays: `Retard moyen ${Math.round(avg)} min`,
        ok: 'Trafic normal',
      }[health];
      const parts = [];
      if (a.deviated) parts.push(`${a.deviated} course${a.deviated > 1 ? 's' : ''} en déviation partielle`);
      if (avg != null && health !== 'delays') parts.push(`retard moyen ${Math.round(avg)} min`);
      parts.push(`${a.trips} course${a.trips > 1 ? 's' : ''} restantes`);
      out.push({ ...a, avg, health, title, detail: parts.join(' · ') });
    }
    const rank = { cancel: 3, deviation: 2, delays: 1, ok: 0 };
    return out.sort((x, y) => rank[y.health] - rank[x.health] || compareRoutes(x.route, y.route));
  }

  get statusLine() {
    const p = [];
    if (this.rtError) p.push(this.rtError);
    if (this.rtAt) p.push(`MAJ ${hhmm(new Date(this.rtAt))} · temps réel TAO`);
    else if (!this.rtError) p.push('Connexion au temps réel…');
    return p.join(' · ');
  }
}

export const tao = new TaoRepo();
