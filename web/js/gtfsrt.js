// Décodeur GTFS-Realtime minimal (Protobuf), sans dépendance.
// Attention : les horodatages dépassent 2^31, on n'utilise donc PAS les opérateurs
// binaires de JavaScript (limités à 32 bits) pour reconstruire les entiers.

class Pb {
  constructor(b, pos, end) { this.b = b; this.pos = pos; this.end = end; }
  get more() { return this.pos < this.end; }
  varint() {
    let result = 0;
    let mul = 1;
    while (this.pos < this.end) {
      const byte = this.b[this.pos++];
      result += (byte & 0x7f) * mul;
      if ((byte & 0x80) === 0) break;
      mul *= 128;
      if (mul > 2 ** 63) break;
    }
    return result;
  }
  sub() {
    const len = this.varint();
    const start = this.pos;
    this.pos = start + len;
    return new Pb(this.b, start, start + len);
  }
  string() {
    const len = this.varint();
    const start = this.pos;
    this.pos = start + len;
    return dec.decode(this.b.subarray(start, start + len));
  }
  skip(wt) {
    if (wt === 0) this.varint();
    else if (wt === 1) this.pos += 8;
    else if (wt === 2) { const len = this.varint(); this.pos += len; }
    else if (wt === 5) this.pos += 4;
    else this.pos = this.end;
  }
}

const dec = new TextDecoder('utf-8');

/** int32 signé encodé en varint (retards négatifs). */
function toInt32(v) {
  const x = v % 4294967296;
  return x >= 2147483648 ? x - 4294967296 : x;
}

/**
 * Renvoie { timestamp, trips: Map(tripId -> trip) }.
 * trip = { id, routeId, dir, rel, stus: [{ seq, stopId, t, arrDelay, depDelay, rel }] }
 */
export function decodeFeed(bytes) {
  // JSON ?
  let i = 0;
  while (i < bytes.length && i < 8 && (bytes[i] === 0x20 || bytes[i] === 0x0a || bytes[i] === 0x0d || bytes[i] === 0x09 || bytes[i] === 0xef || bytes[i] === 0xbb || bytes[i] === 0xbf)) i++;
  if (bytes[i] === 0x7b) return decodeJson(JSON.parse(dec.decode(bytes)));

  const r = new Pb(bytes, 0, bytes.length);
  let ts = 0;
  const trips = new Map();
  while (r.more) {
    const key = r.varint();
    const f = Math.floor(key / 8), wt = key % 8;
    if (f === 1 && wt === 2) ts = header(r.sub());
    else if (f === 2 && wt === 2) entity(r.sub(), trips);
    else r.skip(wt);
  }
  return { timestamp: ts, trips };
}

function header(r) {
  let ts = 0;
  while (r.more) {
    const key = r.varint();
    if (Math.floor(key / 8) === 3 && key % 8 === 0) ts = r.varint();
    else r.skip(key % 8);
  }
  return ts;
}

function entity(r, trips) {
  let deleted = false;
  let trip = null;
  while (r.more) {
    const key = r.varint();
    const f = Math.floor(key / 8), wt = key % 8;
    if (f === 2 && wt === 0) deleted = r.varint() !== 0;
    else if (f === 3 && wt === 2) trip = tripUpdate(r.sub());
    else r.skip(wt);
  }
  if (!deleted && trip && trip.id) trips.set(trip.id, finish(trip));
}

function tripUpdate(r) {
  const t = { id: '', routeId: '', dir: 0, rel: 0, stus: [] };
  while (r.more) {
    const key = r.varint();
    const f = Math.floor(key / 8), wt = key % 8;
    if (f === 1 && wt === 2) {
      const d = r.sub();
      while (d.more) {
        const k = d.varint();
        const ff = Math.floor(k / 8), w = k % 8;
        if (ff === 1 && w === 2) t.id = d.string();
        else if (ff === 4 && w === 0) t.rel = d.varint();
        else if (ff === 5 && w === 2) t.routeId = d.string();
        else if (ff === 6 && w === 0) t.dir = d.varint();
        else d.skip(w);
      }
    } else if (f === 2 && wt === 2) {
      t.stus.push(stu(r.sub()));
    } else r.skip(wt);
  }
  return t;
}

function stu(r) {
  const s = { seq: 0, stopId: '', arr: null, dep: null, arrDelay: null, depDelay: null, rel: 0 };
  while (r.more) {
    const key = r.varint();
    const f = Math.floor(key / 8), wt = key % 8;
    if (f === 1 && wt === 0) s.seq = r.varint();
    else if ((f === 2 || f === 3) && wt === 2) {
      const e = r.sub();
      let delay = null, time = null;
      while (e.more) {
        const k = e.varint();
        const ff = Math.floor(k / 8), w = k % 8;
        if (ff === 1 && w === 0) delay = toInt32(e.varint());
        else if (ff === 2 && w === 0) time = e.varint();
        else e.skip(w);
      }
      if (f === 2) { s.arr = time; s.arrDelay = delay; } else { s.dep = time; s.depDelay = delay; }
    } else if (f === 4 && wt === 2) s.stopId = r.string();
    else if (f === 5 && wt === 0) s.rel = r.varint();
    else r.skip(wt);
  }
  return s;
}

function finish(t) {
  for (const s of t.stus) {
    s.t = s.dep ?? s.arr ?? 0;
    s.skipped = s.rel === 1;
  }
  t.stus.sort((a, b) => a.seq - b.seq);
  t.cancelled = t.rel === 3 || (t.stus.length > 0 && t.stus.every((s) => s.skipped));
  t.partly = !t.cancelled && t.stus.some((s) => s.skipped);
  return t;
}

// ── Variante JSON ──
const TRIP_REL = { SCHEDULED: 0, ADDED: 1, UNSCHEDULED: 2, CANCELED: 3, CANCELLED: 3 };
const STU_REL = { SCHEDULED: 0, SKIPPED: 1, NO_DATA: 2 };
const k = (m, a, b) => (m ? (m[a] ?? m[b]) : undefined);
const num = (v) => (v == null ? null : Number(v));
const rel = (v, map) => (typeof v === 'string' ? (map[v.toUpperCase()] ?? 0) : (v || 0));

function decodeJson(root) {
  const trips = new Map();
  for (const e of root.entity || root.entities || []) {
    if (k(e, 'isDeleted', 'is_deleted')) continue;
    const tu = k(e, 'tripUpdate', 'trip_update');
    if (!tu) continue;
    const td = tu.trip || {};
    const t = {
      id: String(k(td, 'tripId', 'trip_id') || ''),
      routeId: String(k(td, 'routeId', 'route_id') || ''),
      dir: num(k(td, 'directionId', 'direction_id')) || 0,
      rel: rel(k(td, 'scheduleRelationship', 'schedule_relationship'), TRIP_REL),
      stus: (k(tu, 'stopTimeUpdate', 'stop_time_update') || []).map((s) => ({
        seq: num(k(s, 'stopSequence', 'stop_sequence')) || 0,
        stopId: String(k(s, 'stopId', 'stop_id') || ''),
        arr: num(s.arrival?.time), dep: num(s.departure?.time),
        arrDelay: num(s.arrival?.delay), depDelay: num(s.departure?.delay),
        rel: rel(k(s, 'scheduleRelationship', 'schedule_relationship'), STU_REL),
      })),
    };
    if (t.id) trips.set(t.id, finish(t));
  }
  return { timestamp: num(root.header?.timestamp) || 0, trips };
}
