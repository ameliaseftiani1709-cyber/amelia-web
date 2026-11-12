// js/app.js — login, routing, dan kerangka aplikasi
import { api, session } from './api.js';
import { $, $$, state, esc, toast, closeModal, setLoading } from './ui.js';
import { pages } from './pages.js';

const MENU = [
  { id: 'dashboard', label: 'Dashboard', icon: 'ri-dashboard-line', sub: 'Ringkasan stok dan peminjaman laboratorium', roles: ['admin', 'staff'] },
  { id: 'barang', label: 'Barang', icon: 'ri-archive-2-line', sub: 'Daftar inventaris dan ketersediaannya', roles: ['admin', 'staff'] },
  { id: 'peminjaman', label: 'Peminjaman', icon: 'ri-hand-coin-line', sub: 'Catat barang yang dipinjam', roles: ['admin', 'staff'] },
  { id: 'pengembalian', label: 'Pengembalian', icon: 'ri-arrow-go-back-line', sub: 'Proses barang yang dikembalikan', roles: ['admin', 'staff'] },
  { id: 'riwayat', label: 'Riwayat', icon: 'ri-history-line', sub: 'Seluruh transaksi peminjaman dan pengembalian', roles: ['admin', 'staff'] },
  { id: 'pengguna', label: 'Pengguna', icon: 'ri-team-line', sub: 'Kelola akun Staff laboratorium', roles: ['admin'] },
];

/* ---------- Skeleton: tampil instan selagi data dimuat ---------- */
function skeleton(id) {
  if (id === 'dashboard') {
    return `<div class="kpis">${'<div class="sk sk-kpi"></div>'.repeat(4)}</div>
      <div class="dash-grid"><div class="sk sk-panel"></div><div class="sk sk-panel"></div></div>`;
  }
  return `<div class="sk sk-line" style="max-width:520px"></div>${'<div class="sk sk-line"></div>'.repeat(6)}`;
}

/* ---------- Tampilan ---------- */
function show(view) {
  $('#boot').classList.add('hidden');
  $('#login-view').classList.toggle('hidden', view !== 'login');
  $('#app-view').classList.toggle('hidden', view !== 'app');
}

function renderShell() {
  const u = state.user;
  $('#nav').innerHTML = MENU.filter((m) => m.roles.includes(u.role))
    .map((m) => `<a href="#/${m.id}" data-id="${m.id}"><i class="${m.icon}"></i>${m.label}</a>`).join('');
  $('#user-name').textContent = u.full_name;
  $('#user-role').textContent = u.role === 'admin' ? 'Admin' : 'Staff laboratorium';
}

/* ---------- Router ---------- */
async function route() {
  if (!state.user) return;
  const id = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const menu = MENU.find((m) => m.id === id && m.roles.includes(state.user.role));
  if (!menu) {
    if (MENU.some((m) => m.id === id)) toast('Halaman itu hanya untuk Admin.', 'error');
    location.replace('#/dashboard');
    return;
  }

  closeModal();
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.id === id));
  $('#page-title').textContent = menu.label;
  $('#page-sub').textContent = menu.sub;
  $('#page-actions').innerHTML = '';
  document.title = `${menu.label} · LabInv`;

  // Setiap navigasi memakai wadah baru, jadi respons lama tidak menimpa halaman baru
  const view = document.createElement('div');
  view.innerHTML = skeleton(id);
  $('#page').replaceChildren(view);

  try {
    await pages[id](view);
  } catch (err) {
    if (!view.isConnected) return;
    view.innerHTML = `
      <div class="panel error-box">
        <i class="ri-cloud-off-line"></i>
        <h2>Data belum bisa dimuat</h2>
        <p>${esc(err.message)}</p>
        <button class="btn btn-primary" id="retry"><i class="ri-refresh-line"></i> Coba lagi</button>
      </div>`;
    $('#retry', view).onclick = route;
  }
}

function startApp() {
  renderShell();
  show('app');
  if (!location.hash || location.hash === '#' || location.hash === '#/') location.hash = '#/dashboard';
  else route();
}

/* ---------- Login & logout ---------- */
async function login(username, password) {
  const err = $('#login-error');
  const btn = $('#login-btn');
  err.classList.add('hidden');
  setLoading(btn, true, 'Memeriksa akun…');
  $$('.demo-card').forEach((b) => { b.disabled = true; });
  try {
    const data = await api('/auth/login', { method: 'POST', body: { username, password } });
    session.token = data.token;
    state.user = data.user;
    $('#login-form').reset();
    toast(`Selamat datang, ${data.user.full_name}.`);
    startApp();
  } catch (e) {
    err.innerHTML = `<i class="ri-error-warning-line"></i><span>${esc(e.message)}</span>`;
    err.classList.remove('hidden');
  } finally {
    setLoading(btn, false);
    $$('.demo-card').forEach((b) => { b.disabled = false; });
  }
}

function logout(message) {
  session.token = null;
  state.user = null;
  closeModal();
  history.replaceState(null, '', location.pathname);
  show('login');
  if (message) toast(message, 'info');
}

/* ---------- Event ---------- */
function bindEvents() {
  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    login($('#login-username').value.trim(), $('#login-password').value);
  });

  $$('.demo-card').forEach((card) => card.addEventListener('click', () => {
    $('#login-username').value = card.dataset.user;
    $('#login-password').value = card.dataset.pass;
    login(card.dataset.user, card.dataset.pass);
  }));

  $('#toggle-pass').addEventListener('click', () => {
    const input = $('#login-password');
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    $('#toggle-pass').innerHTML = `<i class="${visible ? 'ri-eye-off-line' : 'ri-eye-line'}"></i>`;
    $('#toggle-pass').setAttribute('aria-label', visible ? 'Sembunyikan password' : 'Tampilkan password');
  });

  $('#logout-btn').addEventListener('click', () => logout('Anda telah keluar.'));
  $('#modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  window.addEventListener('hashchange', route);
  window.addEventListener('auth:expired', (e) => {
    if (state.user) logout(e.detail || 'Sesi berakhir, silakan login kembali.');
  });
}

/* ---------- Mulai ---------- */
async function init() {
  bindEvents();
  if (session.token) {
    try {
      const { user } = await api('/auth/me', { timeout: 10000 });
      state.user = user;
      return startApp();
    } catch {
      session.token = null;
    }
  }
  show('login');
}

init();
