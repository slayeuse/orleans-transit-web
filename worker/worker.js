/**
 * Proxy Cloudflare Worker pour Orléans Transit (gratuit, optionnel mais recommandé).
 *
 *  - /sncf/...  -> api.sncf.com (ajoute la clé API, qui reste secrète)
 *  - /tao-rt    -> flux temps réel TAO (compressé, mis en cache 20 s)
 *
 * Il règle les blocages « CORS » des navigateurs et allège le temps réel TAO
 * (≈ 2 Mo -> quelques centaines de Ko grâce à la compression).
 *
 * Variables à définir dans Cloudflare (Settings → Variables and Secrets) :
 *   SNCF_KEY        votre clé API SNCF (type « Secret »)
 *   ALLOWED_ORIGIN  (facultatif) l'adresse de votre site, ex. https://laurent.github.io
 */
const SNCF = 'https://api.sncf.com/v1/coverage/sncf';
const TAO_RT = 'https://ara-api.enroute.mobi/tao/gtfs/trip-updates';

export default {
  async fetch(request, env, ctx) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('Méthode non autorisée', { status: 405, headers: cors });

    const url = new URL(request.url);

    if (url.pathname.startsWith('/sncf/')) {
      if (!env.SNCF_KEY) return json({ error: { message: 'SNCF_KEY manquante dans le worker' } }, 500, cors);
      const target = SNCF + url.pathname.slice(5) + url.search;
      const r = await fetch(target, { headers: { Authorization: 'Basic ' + btoa(env.SNCF_KEY + ':') } });
      return new Response(r.body, {
        status: r.status,
        headers: { ...cors, 'Content-Type': r.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    if (url.pathname === '/tao-rt') {
      const cache = caches.default;
      const key = new Request('https://cache.local/tao-rt');
      let cached = await cache.match(key);
      let bytes;
      if (cached) {
        bytes = await cached.arrayBuffer();
      } else {
        const r = await fetch(TAO_RT, { headers: { 'User-Agent': 'orleans-transit-proxy' } });
        if (!r.ok) return new Response(`TAO : HTTP ${r.status}`, { status: 502, headers: cors });
        bytes = await r.arrayBuffer();
        ctx.waitUntil(cache.put(key, new Response(bytes, { headers: { 'Cache-Control': 'max-age=20' } })));
      }
      const gz = new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')));
      return new Response(gz.body, {
        headers: {
          ...cors,
          'Content-Type': 'application/octet-stream',
          'Content-Encoding': 'gzip',
          'Cache-Control': 'no-store',
        },
        encodeBody: 'manual',
      });
    }

    return new Response('Orléans Transit proxy : OK', { headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } });
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
