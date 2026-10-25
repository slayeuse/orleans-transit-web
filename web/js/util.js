// Utilitaires : heures, dates, texte, petit système d'événements.

export const two = (n) => String(n).padStart(2, '0');
export const hhmm = (d) => `${two(d.getHours())}:${two(d.getMinutes())}`;
export const nowSec = () => Math.floor(Date.now() / 1000);
export const fromEpoch = (s) => new Date(s * 1000);

export function midnight(d = new Date()) {
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000);
}

export function ymd(d = new Date()) {
  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}`;
}

/** Format Navitia 20261025T093000 -> Date locale */
export function parseNavitia(v) {
  if (typeof v !== 'string' || v.length < 15) return null;
  return new Date(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8),
    +v.slice(9, 11), +v.slice(11, 13), +v.slice(13, 15));
}

export function navitiaDate(d) {
  return `${ymd(d)}T${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}

const JOURS = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];
const MOIS = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT',
  'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];
export const dateLabel = (d) => `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;

/** "PROCHE", "7 MIN" ou l'heure si > 1 h */
export function countdown(date) {
  const m = Math.floor((date.getTime() - Date.now()) / 60000);
  if (m <= 0) return 'PROCHE';
  if (m >= 60) return hhmm(date);
  return `${m} MIN`;
}

export function norm(s) {
  return (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, ' ').trim();
}

export const cleanStation = (s) => (s || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function stripHtml(s) {
  const d = document.createElement('div');
  d.innerHTML = s;
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}

/** Mini observable : on s'abonne aux changements d'un dépôt de données. */
export class Emitter {
  constructor() { this._l = new Set(); }
  on(fn) { this._l.add(fn); return () => this._l.delete(fn); }
  emit() { for (const fn of [...this._l]) { try { fn(); } catch (e) { console.error(e); } } }
}

export async function fetchWithTimeout(url, opts = {}, ms = 25000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Le document est-il visible (onglet actif, écran allumé) ? */
export const visible = () => document.visibilityState !== 'hidden';
