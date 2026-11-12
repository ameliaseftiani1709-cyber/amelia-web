// js/ui.js — state & helper tampilan
export const state = { user: null };

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const tag = (kode) => `<span class="tag">${esc(kode)}</span>`;

/* ---------- Toast ---------- */
export function toast(message, type = 'success') {
  const icons = { success: 'ri-check-line', error: 'ri-error-warning-line', info: 'ri-information-line' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="${icons[type] || icons.info}"></i><span>${esc(message)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 3600);
  setTimeout(() => el.remove(), 4000);
}

/* ---------- Modal ---------- */
let lastFocus = null;
export function openModal(title, html) {
  lastFocus = document.activeElement;
  $('#modal-title').textContent = title;
  const body = $('#modal-body');
  body.innerHTML = html;
  $('#modal').classList.remove('hidden');
  setTimeout(() => body.querySelector('input:not([readonly]), select, textarea, button')?.focus(), 30);
  return body;
}
export function closeModal() {
  if ($('#modal').classList.contains('hidden')) return;
  $('#modal').classList.add('hidden');
  $('#modal-body').innerHTML = '';
  lastFocus?.focus?.();
}
export function confirmDialog(title, message, okText, danger = false) {
  return new Promise((resolve) => {
    const body = openModal(title, `
      <p class="confirm-text">${message}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-no>Batal</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(okText)}</button>
      </div>`);
    body.querySelector('[data-no]').onclick = () => { closeModal(); resolve(false); };
    body.querySelector('[data-yes]').onclick = () => { closeModal(); resolve(true); };
  });
}

/* ---------- Tombol loading ---------- */
export function setLoading(btn, loading, text = 'Memproses…') {
  if (!btn) return;
  if (loading) {
    btn.dataset.html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spin"></span> ${text}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.html) btn.innerHTML = btn.dataset.html;
  }
}

/* ---------- Tanggal ---------- */
export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
const toDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v));
export function fmtDate(v) {
  if (!v) return '–';
  return toDate(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function timeAgo(v) {
  const s = Math.floor((Date.now() - toDate(v)) / 1000);
  if (s < 60) return 'baru saja';
  const m = Math.floor(s / 60); if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24); if (d < 7) return `${d} hari lalu`;
  return fmtDate(v);
}
export function daysSince(dateStr) {
  return Math.max(0, Math.round((toDate(todayISO()) - toDate(dateStr)) / 86400000));
}

export const emptyState = (icon, text) => `<div class="empty"><i class="${icon}"></i><p>${text}</p></div>`;

export function countUp(root) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.querySelectorAll('[data-count]').forEach((n) => {
    const target = Number(n.dataset.count) || 0;
    if (reduce) { n.textContent = target.toLocaleString('id-ID'); return; }
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / 600);
      n.textContent = Math.round(target * (1 - (1 - p) ** 3)).toLocaleString('id-ID');
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
