// TER Artenay ⇄ Orléans via l'API SNCF (moteur Navitia).
import { Settings, URLS } from './config.js';
import { Emitter, cleanStation, fetchWithTimeout, navitiaDate, norm, parseNavitia, stripHtml, visible } from './util.js';

class SncfError extends Error {}

async function api(path, params) {
  const proxy = Settings.proxy;
  const key = Settings.sncfKey;
  const qs = new URLSearchParams(params).toString();
  let url, headers = {};
  if (proxy) {
    // Le proxy ajoute lui-même la clé (elle reste secrète).
    url = `${proxy}/sncf${path}?${qs}`;
  } else if (key) {
    url = `${URLS.sncf}${path}?${qs}`;
    headers.Authorization = 'Basic ' + btoa(key + ':');
  } else {
    throw new SncfError('Clé API SNCF manquante : ajoutez-la dans RÉGLAGES.');
  }
  let r;
  try {
    r = await fetchWithTimeout(url, { headers }, 20000);
  } catch (e) {
    throw new SncfError(e.name === 'AbortError' ? 'Délai dépassé (serveur SNCF)' : 'Serveur SNCF injoignable (connexion ou blocage du navigateur)');
  }
  let json = {};
  try { json = await r.json(); } catch (_) { /* vide */ }
  if (r.status === 401 || r.status === 403) throw new SncfError(`Clé API SNCF refusée (${r.status})`);
  if (r.status === 429) throw new SncfError('Quota de l\'API SNCF atteint, réessayez plus tard');
  if (r.status !== 200) {
    const id = json?.error?.id;
    if (id === 'no_solution' || id === 'date_out_of_bounds') return {};
    throw new SncfError(json?.error?.message || `Erreur SNCF ${r.status}`);
  }
  return json;
}

const ORLEANS_FALLBACK = { id: 'stop_area:SNCF:87543009', name: 'Orléans', lat: 47.9078, lon: 1.9047 };

class TerRepo extends Emitter {
  constructor() {
    super();
    this.artenay = Settings.cache('st_artenay');
    this.orleans = Settings.cache('st_orleans');
    this.toOrleans = null;
    this.toArtenay = null;
    this.loading = false;
    this.error = null;
    this.updatedAt = null;
    this._users = 0;
    this._timer = null;
  }

  attach() {
    this._users++;
    if (this._users === 1) {
      this.refresh();
      this._timer = setInterval(() => { if (visible()) this.refresh(); }, 60000);
    }
    return () => this.detach();
  }

  detach() {
    this._users = Math.max(0, this._users - 1);
    if (this._users === 0) { clearInterval(this._timer); this._timer = null; }
  }

  resetStations() {
    Settings.cache('st_artenay', null);
    Settings.cache('st_orleans', null);
    this.artenay = null;
    this.orleans = null;
  }

  get disruptions() {
    const seen = new Set();
    const out = [];
    for (const b of [this.toOrleans, this.toArtenay]) {
      for (const d of b?.disruptions || []) {
        if (d.status !== 'active' || seen.has(d.id)) continue;
        seen.add(d.id);
        out.push(d);
      }
    }
    return out;
  }

  async refresh(force = false) {
    if (this.loading) return;
    if (!force && this.updatedAt && Date.now() - this.updatedAt < 20000) return;
    this.loading = true;
    this.emit();
    try {
      if (!this.artenay) this.artenay = await this._resolve('st_artenay', 'Artenay', null);
      if (!this.orleans) this.orleans = await this._resolve('st_orleans', 'Orléans', ORLEANS_FALLBACK);
      if (!this.artenay || !this.orleans) throw new SncfError('Gares introuvables dans l\'API SNCF');
      const [a, b] = await Promise.all([
        this._direction(this.artenay.id, this.orleans.id),
        this._direction(this.orleans.id, this.artenay.id),
      ]);
      this.toOrleans = a;
      this.toArtenay = b;
      this.error = null;
      this.updatedAt = Date.now();
    } catch (e) {
      this.error = e instanceof SncfError ? e.message : `Erreur : ${e.message || e}`;
    }
    this.loading = false;
    this.emit();
  }

  async _resolve(cacheKey, query, fallback) {
    let best = null;
    try {
      const j = await api('/places', { q: query, 'type[]': 'stop_area', count: '10' });
      const target = norm(query);
      for (const pl of j.places || []) {
        if (pl.embedded_type !== 'stop_area') continue;
        const sa = pl.stop_area || {};
        const st = {
          id: sa.id || pl.id,
          name: cleanStation(sa.name || pl.name || ''),
          lat: parseFloat(sa.coord?.lat), lon: parseFloat(sa.coord?.lon),
        };
        if (norm(st.name) === target) { best = st; break; }
        best = best || st;
      }
    } catch (e) {
      if (!fallback) throw e;
    }
    best = best || fallback;
    if (best) Settings.cache(cacheKey, best);
    return best;
  }

  _params(from, to, freshness) {
    return {
      from, to,
      datetime: navitiaDate(new Date(Date.now() - 3 * 60000)),
      datetime_represents: 'departure',
      count: '8',
      max_nb_transfers: '0',
      direct_path: 'none',
      data_freshness: freshness,
    };
  }

  async _direction(from, to) {
    const [base, rt] = await Promise.all([
      api('/journeys', this._params(from, to, 'base_schedule')),
      api('/journeys', this._params(from, to, 'realtime')),
    ]);
    const dis = new Map();
    for (const r of [base, rt]) {
      for (const d of r.disruptions || []) {
        const x = parseDisruption(d);
        if (x) dis.set(x.id, x);
      }
    }
    const B = extract(base);
    const R = extract(rt);
    const rtBy = new Map(R.map((r) => [r.number, r]));
    const used = new Set();
    const trains = [];
    const msgs = (ids) => {
      const out = [];
      for (const id of ids) {
        const t = dis.get(id)?.text;
        if (t && !out.includes(t)) out.push(t);
      }
      return out;
    };
    for (const b of B) {
      const r = rtBy.get(b.number);
      if (r) used.add(r.number);
      const ids = new Set([...b.disIds, ...(r?.disIds || [])]);
      const m = msgs(ids);
      const noService = b.status === 'NO_SERVICE' || r?.status === 'NO_SERVICE' ||
        [...ids].some((id) => dis.get(id)?.effect === 'NO_SERVICE');
      if (noService || !r) {
        trains.push({
          ...b, baseDep: b.dep, baseArr: b.arr,
          state: noService ? 'cancelled' : (ids.size ? 'disrupted' : 'theoretical'),
          delay: 0, messages: m,
        });
        continue;
      }
      trains.push(fromRealtime(r, b.dep, b.arr, m));
    }
    for (const r of R) {
      if (!used.has(r.number)) trains.push(fromRealtime(r, r.baseDep || r.dep, r.baseArr || r.arr, msgs(r.disIds)));
    }
    trains.sort((a, b) => a.baseDep - b.baseDep);
    const limit = Date.now() - 60000;
    return { trains: trains.filter((t) => t.dep.getTime() > limit), disruptions: [...dis.values()] };
  }
}

function fromRealtime(r, baseDep, baseArr, messages) {
  const bd = r.baseDep || baseDep;
  const ba = r.baseArr || baseArr;
  const d1 = Math.round((r.dep - bd) / 60000);
  const d2 = Math.round((r.arr - ba) / 60000);
  const worst = Math.max(d1, d2);
  return {
    ...r, baseDep: bd, baseArr: ba,
    state: worst >= 1 ? 'delayed' : (messages.length ? 'disrupted' : 'onTime'),
    delay: Math.max(0, worst),
    messages,
  };
}

function extract(json) {
  const out = [];
  for (const j of json.journeys || []) {
    const pt = (j.sections || []).find((s) => s.type === 'public_transport');
    if (!pt) continue;
    const di = pt.display_informations || {};
    const dep = parseNavitia(pt.departure_date_time);
    const arr = parseNavitia(pt.arrival_date_time);
    if (!dep || !arr) continue;
    const ids = new Set();
    for (const links of [di.links, pt.links, j.links]) {
      for (const l of links || []) if (l.type === 'disruption' && l.id) ids.add(l.id);
    }
    const stops = (pt.stop_date_times || []).map((s) => ({
      name: cleanStation(s.stop_point?.name || ''),
      time: parseNavitia(s.departure_date_time) || parseNavitia(s.arrival_date_time),
      base: parseNavitia(s.base_departure_date_time) || parseNavitia(s.base_arrival_date_time),
      platform: s.stop_point?.platform_code || null,
    }));
    out.push({
      number: di.headsign || di.trip_short_name || di.name || '?',
      mode: di.commercial_mode || 'TER',
      direction: cleanStation(di.direction || ''),
      dep, arr,
      baseDep: parseNavitia(pt.base_departure_date_time),
      baseArr: parseNavitia(pt.base_arrival_date_time),
      status: j.status || '',
      disIds: ids,
      stops,
      platformDep: stops[0]?.platform || null,
    });
  }
  return out;
}

function parseDisruption(d) {
  if (!d?.id) return null;
  let text = '';
  for (const m of d.messages || []) {
    if (m.text && m.text.trim()) { text = stripHtml(m.text); break; }
  }
  const title = d.severity?.name || '';
  return {
    id: d.id,
    status: d.status || '',
    effect: d.severity?.effect || '',
    title,
    text: text || title || 'Perturbation',
  };
}

export const ter = new TerRepo();
