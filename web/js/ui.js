// Composants d'interface (chaînes HTML) + feuille du bas + toast.
import { esc, hhmm } from './util.js';

const P = {
  home: 'M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z',
  train: 'M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  bus: 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z',
  map: 'M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z',
  tune: 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
  refresh: 'M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  star: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  starO: 'M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z',
  swap: 'M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z',
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
};

export const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${P[name]}"/></svg>`;

function lum(hex) {
  const h = (hex || '#888').replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Puce de ligne ronde. */
export function bullet(label, color, text, size = 40) {
  const auto = lum(color) > 0.55 ? '#000' : '#fff';
  let fg = text || auto;
  if (Math.abs(lum(fg) - lum(color)) < 0.25) fg = auto;
  const n = String(label).length;
  const cls = n >= 4 ? 'n4' : n === 3 ? 'n3' : n === 2 ? 'n2' : '';
  return `<span class="bullet ${cls}" style="--s:${size}px;background:${color};color:${fg}">${esc(label)}</span>`;
}

export const routeBullet = (r, size = 40) => bullet(r.short, r.color, r.text, size);
export const terBullet = (size = 40) => bullet('TER', '#0062B0', '#fff', size);

export function chip(kind, text) {
  if (kind === 'red') return `<span class="chip red">${esc(text)}</span>`;
  return `<span class="chip ${kind}"><i></i>${esc(text)}</span>`;
}

export function terChip(t) {
  switch (t.state) {
    case 'onTime': return chip('green', "À l'heure");
    case 'delayed': return chip('red', `+${t.delay} MIN`);
    case 'cancelled': return chip('red', 'SUPPRIMÉ');
    case 'disrupted': return chip('orange', 'PERTURBÉ');
    default: return chip('grey', 'THÉORIQUE');
  }
}

export const spinner = () => '<div class="spinner"></div>';
export const empty = (ico, text, action = '') => `<div class="empty"><div class="ico">${ico}</div>${esc(text)}${action ? `<div style="margin-top:14px">${action}</div>` : ''}</div>`;

/**
 * Frise verticale d'arrêts.
 * stops : [{name, time, old, note, timeClass, noteClass, hl, skip, action}]
 */
export function timeline(stops, color) {
  return `<div class="tl" style="--c:${color}">${stops.map((s, i) => {
    const cls = ['tl-row', i === 0 ? 'first' : '', i === stops.length - 1 ? 'last' : '', s.hl ? 'hl' : '', s.skip ? 'skip' : ''].join(' ');
    const tag = s.action ? 'button' : 'div';
    return `<${tag} class="${cls}" ${s.action ? `data-action="${esc(s.action)}"` : ''} ${s.hl ? 'data-hl="1"' : ''}>
      <div class="tl-rail"><span class="tl-dot"></span></div>
      <div class="tl-body"><b class="ellipsis">${esc(s.name)}</b>${s.note ? `<small class="${s.noteClass || ''}">${esc(s.note)}</small>` : ''}</div>
      <div class="tl-time">${s.time ? `<b class="${s.timeClass || ''}">${esc(s.time)}</b>` : ''}${s.old ? `<s>${esc(s.old)}</s>` : ''}</div>
      ${s.action ? '<span class="chev">›</span>' : ''}
    </${tag}>`;
  }).join('')}</div>`;
}

// ───────────── feuille du bas ─────────────
let current = null;

export function openSheet(render, { onClose } = {}) {
  closeSheet(true);
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  const sh = document.createElement('div');
  sh.className = 'sheet';
  sh.setAttribute('role', 'dialog');
  document.body.append(bg, sh);
  const draw = () => {
    const { head, body } = render();
    const prev = sh.querySelector('.sh-body')?.scrollTop;
    sh.innerHTML = `<div class="grab"></div><div class="sh-head">${head}</div><div class="sh-body">${body}</div>`;
    if (prev != null) sh.querySelector('.sh-body').scrollTop = prev;
  };
  draw();
  requestAnimationFrame(() => { bg.classList.add('on'); sh.classList.add('on'); });
  bg.addEventListener('click', () => closeSheet());
  // Glisser vers le bas pour fermer
  let y0 = null;
  sh.addEventListener('touchstart', (e) => {
    if (sh.querySelector('.sh-body').scrollTop > 0) return;
    y0 = e.touches[0].clientY;
  }, { passive: true });
  sh.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0) sh.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sh.addEventListener('touchend', (e) => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0;
    y0 = null;
    sh.style.transform = '';
    if (dy > 110) closeSheet();
  });
  current = { bg, sh, draw, onClose };
  return { sheet: sh, redraw: draw };
}

export function closeSheet(instant = false) {
  if (!current) return;
  const { bg, sh, onClose } = current;
  current = null;
  onClose?.();
  if (instant) { bg.remove(); sh.remove(); return; }
  bg.classList.remove('on');
  sh.classList.remove('on');
  setTimeout(() => { bg.remove(); sh.remove(); }, 260);
}

export function redrawSheet() { current?.draw(); }
export const sheetOpen = () => !!current;

let toastTimer = null;
export function toast(text) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.append(t); }
  t.textContent = text;
  requestAnimationFrame(() => t.classList.add('on'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 1800);
}

export const timeStr = (d) => (d ? hhmm(d) : '');
