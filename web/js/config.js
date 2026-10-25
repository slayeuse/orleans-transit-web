// Configuration et réglages (stockés dans le navigateur).

// Remplacé automatiquement à la compilation par le secret GitHub CARTO_API_KEY.
const BUILD_CARTO_KEY = '__CARTO_API_KEY__';
// Optionnel : URL d'un proxy (worker Cloudflare) remplacée par le secret PROXY_URL.
const BUILD_PROXY_URL = '__PROXY_URL__';

export const URLS = {
  sncf: 'https://api.sncf.com/v1/coverage/sncf',
  taoRt: 'https://ara-api.enroute.mobi/tao/gtfs/trip-updates',
  data: './data',
};

function get(k) {
  try { return localStorage.getItem(k) || ''; } catch (_) { return ''; }
}
function set(k, v) {
  try {
    if (v) localStorage.setItem(k, v); else localStorage.removeItem(k);
  } catch (_) { /* navigation privée */ }
}

const clean = (v) => (v && !v.startsWith('__') ? v.trim() : '');

export const Settings = {
  get sncfKey() { return get('ot_sncf_key').trim(); },
  set sncfKey(v) { set('ot_sncf_key', (v || '').trim()); },

  get cartoKey() { return get('ot_carto_key').trim() || clean(BUILD_CARTO_KEY); },
  set cartoKey(v) { set('ot_carto_key', (v || '').trim()); },
  get hasBuildCarto() { return !!clean(BUILD_CARTO_KEY); },

  get proxy() { return (get('ot_proxy').trim() || clean(BUILD_PROXY_URL)).replace(/\/+$/, ''); },
  set proxy(v) { set('ot_proxy', (v || '').trim()); },
  get hasBuildProxy() { return !!clean(BUILD_PROXY_URL); },

  get favorites() {
    try { return JSON.parse(get('ot_favs') || '[]'); } catch (_) { return []; }
  },
  set favorites(list) { set('ot_favs', JSON.stringify(list)); },

  cache(key, value) {
    if (value === undefined) {
      try { return JSON.parse(get('ot_c_' + key) || 'null'); } catch (_) { return null; }
    }
    set('ot_c_' + key, JSON.stringify(value));
  },
};

export function cartoTiles() {
  const k = Settings.cartoKey;
  return 'https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png' +
    (k ? '?key=' + encodeURIComponent(k) : '');
}
