// js/api.js — pemanggil REST API dengan batas waktu (tidak pernah loading tanpa akhir)
const TOKEN_KEY = 'labinv_token';

export const session = {
  get token() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set token(v) { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* abaikan */ } },
};

export async function api(path, { method = 'GET', body, timeout = 15000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session.token) headers.Authorization = `Bearer ${session.token}`;

  try {
    const res = await fetch(`/api${path}`, {
      method, headers, signal: ctrl.signal,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401 && path !== '/auth/login') {
      session.token = null;
      window.dispatchEvent(new CustomEvent('auth:expired', { detail: data.error }));
    }
    if (!res.ok) throw new Error(data.error || `Permintaan gagal (kode ${res.status}).`);
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Server terlalu lama merespons. Periksa koneksi lalu coba lagi.');
    if (err instanceof TypeError) throw new Error('Tidak dapat terhubung ke server. Pastikan server berjalan.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
