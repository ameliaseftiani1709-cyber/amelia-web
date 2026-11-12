// server/app.js — REST API (dipakai server lokal & Vercel)
const express = require('express');
const { query, tx } = require('./db');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('./auth');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

/* ---------- Helper ---------- */
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const text = (v, max) => String(v ?? '').trim().slice(0, max);
const int = (v) => { const n = Number(v); return Number.isInteger(n) ? n : NaN; };
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const todayWIB = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

const publicUser = (u) => ({
  id: u.id, username: u.username, full_name: u.full_name, role: u.role,
  is_active: !!u.is_active, created_at: u.created_at,
});

async function log(conn, user, aksi, detail) {
  const sql = 'INSERT INTO activity_logs (user_id, actor_name, aksi, detail) VALUES (?, ?, ?, ?)';
  const params = [user.id, user.full_name, aksi, String(detail).slice(0, 255)];
  if (conn) await conn.query(sql, params);
  else await query(sql, params);
}

/* ---------- Middleware hak akses ---------- */
const requireAuth = wrap(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const payload = verifyToken(header.startsWith('Bearer ') ? header.slice(7) : '');
  if (!payload) fail(401, 'Sesi berakhir, silakan login kembali.');
  const [user] = await query(
    'SELECT id, username, full_name, role, is_active, created_at FROM users WHERE id = ?', [payload.sub],
  );
  if (!user || !user.is_active) fail(401, 'Akun tidak aktif atau tidak ditemukan.');
  req.user = user;
  next();
});

const requireAdmin = (req, res, next) =>
  (req.user.role === 'admin' ? next() : next(new HttpError(403, 'Hanya Admin yang dapat melakukan aksi ini.')));

/* =====================================================
   HEALTH CHECK
===================================================== */
app.get('/api/health', wrap(async (req, res) => {
  const t = Date.now();
  await query('SELECT 1');
  res.json({ ok: true, database: 'TiDB', latency_ms: Date.now() - t });
}));

/* =====================================================
   AUTH
===================================================== */
app.post('/api/auth/login', wrap(async (req, res) => {
  const username = text(req.body?.username, 30).toLowerCase();
  const password = String(req.body?.password || '');
  if (!username || !password) fail(400, 'Username dan password wajib diisi.');

  const [u] = await query('SELECT * FROM users WHERE username = ?', [username]);
  if (!u || !verifyPassword(password, u.password_hash)) fail(401, 'Username atau password salah.');
  if (!u.is_active) fail(403, 'Akun Anda dinonaktifkan. Hubungi Admin.');

  res.json({ token: signToken({ sub: u.id, role: u.role }), user: publicUser(u) });
}));

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

/* =====================================================
   DASHBOARD — satu request, semua query paralel
===================================================== */
app.get('/api/dashboard', requireAuth, wrap(async (req, res) => {
  const admin = req.user.role === 'admin';
  const [itemRows, trxRows, categories, low, logs, active, extraRows] = await Promise.all([
    query('SELECT COUNT(*) AS jenis, COALESCE(SUM(stok),0) AS total, COALESCE(SUM(tersedia),0) AS tersedia FROM items'),
    query("SELECT COUNT(*) AS total, COALESCE(SUM(status = 'dipinjam'),0) AS aktif FROM transactions"),
    query('SELECT kategori, SUM(stok) AS stok, SUM(tersedia) AS tersedia FROM items GROUP BY kategori ORDER BY SUM(stok) DESC'),
    query('SELECT id, kode, nama, kategori, stok, tersedia FROM items WHERE stok > 0 AND tersedia <= CEIL(stok * 0.3) ORDER BY tersedia / stok, nama LIMIT 5'),
    query('SELECT actor_name, aksi, detail, created_at FROM activity_logs ORDER BY created_at DESC, id DESC LIMIT 8'),
    query("SELECT id, kode, peminjam, item_nama, jumlah, tanggal_pinjam FROM transactions WHERE status = 'dipinjam' ORDER BY tanggal_pinjam, id LIMIT 6"),
    admin
      ? query("SELECT COUNT(*) AS n FROM users WHERE role = 'staff' AND is_active = 1")
      : query('SELECT COUNT(*) AS n FROM transactions WHERE dicatat_oleh = ?', [req.user.id]),
  ]);

  const it = itemRows[0];
  const tr = trxRows[0];
  res.json({
    stats: {
      jenis: Number(it.jenis), total: Number(it.total), tersedia: Number(it.tersedia),
      dipinjam: Number(it.total) - Number(it.tersedia),
      transaksi: Number(tr.total), aktif: Number(tr.aktif), extra: Number(extraRows[0].n),
    },
    categories: categories.map((c) => ({ kategori: c.kategori, stok: Number(c.stok), tersedia: Number(c.tersedia) })),
    low, logs, active,
  });
}));

/* =====================================================
   BARANG
===================================================== */
function readItem(body) {
  const d = {
    kode: text(body.kode, 20).toUpperCase(),
    nama: text(body.nama, 100),
    kategori: text(body.kategori, 50),
    lokasi: text(body.lokasi, 60) || null,
    stok: int(body.stok),
  };
  if (!d.kode || !d.nama || !d.kategori) fail(400, 'Kode, nama, dan kategori wajib diisi.');
  if (!/^[A-Z0-9-]+$/.test(d.kode)) fail(400, 'Kode hanya boleh berisi huruf, angka, dan tanda minus.');
  if (Number.isNaN(d.stok) || d.stok < 0 || d.stok > 100000) fail(400, 'Stok harus berupa angka 0 atau lebih.');
  return d;
}

app.get('/api/items', requireAuth, wrap(async (req, res) => {
  res.json({ items: await query('SELECT * FROM items ORDER BY kode') });
}));

app.post('/api/items', requireAuth, requireAdmin, wrap(async (req, res) => {
  const d = readItem(req.body || {});
  const r = await query(
    'INSERT INTO items (kode, nama, kategori, lokasi, stok, tersedia) VALUES (?, ?, ?, ?, ?, ?)',
    [d.kode, d.nama, d.kategori, d.lokasi, d.stok, d.stok],
  );
  await log(null, req.user, 'barang', `Menambahkan barang ${d.nama} (${d.kode}) sebanyak ${d.stok} unit`);
  const [item] = await query('SELECT * FROM items WHERE id = ?', [r.insertId]);
  res.status(201).json({ item });
}));

app.put('/api/items/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
  const id = int(req.params.id);
  const d = readItem(req.body || {});
  const item = await tx(async (conn) => {
    const [[cur]] = await conn.query('SELECT * FROM items WHERE id = ? FOR UPDATE', [id]);
    if (!cur) fail(404, 'Barang tidak ditemukan.');
    const dipinjam = cur.stok - cur.tersedia;
    if (d.stok < dipinjam) fail(400, `Stok tidak boleh kurang dari ${dipinjam} karena sedang dipinjam.`);
    await conn.query(
      'UPDATE items SET kode = ?, nama = ?, kategori = ?, lokasi = ?, stok = ?, tersedia = ? WHERE id = ?',
      [d.kode, d.nama, d.kategori, d.lokasi, d.stok, d.stok - dipinjam, id],
    );
    await log(conn, req.user, 'barang', `Mengubah data barang ${d.nama} (${d.kode})`);
    const [[row]] = await conn.query('SELECT * FROM items WHERE id = ?', [id]);
    return row;
  });
  res.json({ item });
}));

app.delete('/api/items/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
  const id = int(req.params.id);
  await tx(async (conn) => {
    const [[cur]] = await conn.query('SELECT * FROM items WHERE id = ? FOR UPDATE', [id]);
    if (!cur) fail(404, 'Barang tidak ditemukan.');
    const [[{ n }]] = await conn.query(
      "SELECT COUNT(*) AS n FROM transactions WHERE item_id = ? AND status = 'dipinjam'", [id],
    );
    if (Number(n) > 0) fail(400, 'Barang masih dipinjam, tidak bisa dihapus.');
    await conn.query('DELETE FROM items WHERE id = ?', [id]);
    await conn.query('UPDATE transactions SET item_id = NULL WHERE item_id = ?', [id]);
    await log(conn, req.user, 'hapus', `Menghapus barang ${cur.nama} (${cur.kode})`);
  });
  res.json({ ok: true });
}));

/* =====================================================
   TRANSAKSI (PEMINJAMAN & PENGEMBALIAN)
===================================================== */
app.get('/api/transactions', requireAuth, wrap(async (req, res) => {
  const where = [];
  const params = [];
  if (['dipinjam', 'selesai'].includes(req.query.status)) { where.push('status = ?'); params.push(req.query.status); }
  const limit = Math.min(Math.max(int(req.query.limit) || 500, 1), 1000);
  const rows = await query(
    `SELECT * FROM transactions ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, id DESC LIMIT ${limit}`,
    params,
  );
  res.json({ transactions: rows });
}));

app.post('/api/transactions', requireAuth, wrap(async (req, res) => {
  const b = req.body || {};
  const itemId = int(b.item_id);
  const jumlah = int(b.jumlah);
  const peminjam = text(b.peminjam, 100);
  const keterangan = text(b.keterangan, 200) || null;
  const tanggal = isDate(b.tanggal) ? b.tanggal : todayWIB();
  if (!peminjam) fail(400, 'Nama peminjam wajib diisi.');
  if (Number.isNaN(itemId)) fail(400, 'Pilih barang yang dipinjam.');
  if (Number.isNaN(jumlah) || jumlah < 1) fail(400, 'Jumlah minimal 1.');

  const trx = await tx(async (conn) => {
    const [[item]] = await conn.query('SELECT * FROM items WHERE id = ? FOR UPDATE', [itemId]);
    if (!item) fail(404, 'Barang tidak ditemukan.');
    if (item.tersedia < jumlah) fail(400, `Stok ${item.nama} tidak cukup. Tersedia ${item.tersedia} unit.`);

    await conn.query('UPDATE items SET tersedia = tersedia - ? WHERE id = ?', [jumlah, itemId]);
    const [r] = await conn.query(
      `INSERT INTO transactions (peminjam, item_id, item_kode, item_nama, jumlah, tanggal_pinjam, keterangan, dicatat_oleh, dicatat_nama)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [peminjam, item.id, item.kode, item.nama, jumlah, tanggal, keterangan, req.user.id, req.user.full_name],
    );
    const kode = `TRX-${String(r.insertId).padStart(5, '0')}`;
    await conn.query('UPDATE transactions SET kode = ? WHERE id = ?', [kode, r.insertId]);
    await log(conn, req.user, 'pinjam', `${peminjam} meminjam ${jumlah} unit ${item.nama} (${kode})`);
    const [[row]] = await conn.query('SELECT * FROM transactions WHERE id = ?', [r.insertId]);
    return row;
  });
  res.status(201).json({ transaction: trx });
}));

app.post('/api/transactions/:id/return', requireAuth, wrap(async (req, res) => {
  const id = int(req.params.id);
  const tanggal = isDate(req.body?.tanggal) ? req.body.tanggal : todayWIB();

  const trx = await tx(async (conn) => {
    const [[t]] = await conn.query('SELECT * FROM transactions WHERE id = ? FOR UPDATE', [id]);
    if (!t) fail(404, 'Transaksi tidak ditemukan.');
    if (t.status === 'selesai') fail(400, 'Transaksi ini sudah selesai.');
    if (tanggal < t.tanggal_pinjam) fail(400, 'Tanggal kembali tidak boleh sebelum tanggal pinjam.');

    if (t.item_id) {
      await conn.query('UPDATE items SET tersedia = LEAST(stok, tersedia + ?) WHERE id = ?', [t.jumlah, t.item_id]);
    }
    await conn.query(
      `UPDATE transactions SET status = 'selesai', tanggal_kembali = ?, diterima_oleh = ?, diterima_nama = ?, returned_at = NOW()
       WHERE id = ?`,
      [tanggal, req.user.id, req.user.full_name, id],
    );
    await log(conn, req.user, 'kembali', `${t.peminjam} mengembalikan ${t.jumlah} unit ${t.item_nama} (${t.kode})`);
    const [[row]] = await conn.query('SELECT * FROM transactions WHERE id = ?', [id]);
    return row;
  });
  res.json({ transaction: trx });
}));

/* =====================================================
   PENGGUNA (ADMIN)
===================================================== */
app.get('/api/users', requireAuth, requireAdmin, wrap(async (req, res) => {
  const rows = await query(
    "SELECT id, username, full_name, role, is_active, created_at FROM users ORDER BY role = 'admin' DESC, created_at, id",
  );
  res.json({ users: rows.map(publicUser) });
}));

app.post('/api/users', requireAuth, requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  const username = text(b.username, 30).toLowerCase();
  const fullName = text(b.full_name, 100);
  const password = String(b.password || '');
  if (!/^[a-z0-9_.]{3,30}$/.test(username)) fail(400, 'Username 3–30 karakter: huruf kecil, angka, titik, atau garis bawah.');
  if (!fullName) fail(400, 'Nama lengkap wajib diisi.');
  if (password.length < 6) fail(400, 'Password minimal 6 karakter.');

  const r = await query(
    "INSERT INTO users (username, password_hash, full_name, role, is_active) VALUES (?, ?, ?, 'staff', 1)",
    [username, hashPassword(password), fullName],
  );
  await log(null, req.user, 'pengguna', `Menambahkan akun staff ${fullName} (@${username})`);
  const [u] = await query('SELECT * FROM users WHERE id = ?', [r.insertId]);
  res.status(201).json({ user: publicUser(u) });
}));

app.put('/api/users/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
  const id = int(req.params.id);
  const fullName = text(req.body?.full_name, 100);
  const password = String(req.body?.password || '');
  if (!fullName) fail(400, 'Nama lengkap wajib diisi.');
  if (password && password.length < 6) fail(400, 'Password baru minimal 6 karakter.');

  const [u] = await query('SELECT * FROM users WHERE id = ?', [id]);
  if (!u) fail(404, 'Pengguna tidak ditemukan.');
  if (password) {
    await query('UPDATE users SET full_name = ?, password_hash = ? WHERE id = ?', [fullName, hashPassword(password), id]);
  } else {
    await query('UPDATE users SET full_name = ? WHERE id = ?', [fullName, id]);
  }
  await log(null, req.user, 'pengguna', `Mengubah data pengguna @${u.username}${password ? ' (password direset)' : ''}`);
  const [row] = await query('SELECT * FROM users WHERE id = ?', [id]);
  res.json({ user: publicUser(row) });
}));

app.patch('/api/users/:id/status', requireAuth, requireAdmin, wrap(async (req, res) => {
  const id = int(req.params.id);
  const active = !!req.body?.is_active;
  const [u] = await query('SELECT * FROM users WHERE id = ?', [id]);
  if (!u) fail(404, 'Pengguna tidak ditemukan.');
  if (u.role !== 'staff') fail(400, 'Hanya akun Staff yang dapat diaktifkan atau dinonaktifkan.');
  await query('UPDATE users SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
  await log(null, req.user, 'pengguna', `${active ? 'Mengaktifkan' : 'Menonaktifkan'} akun staff ${u.full_name} (@${u.username})`);
  res.json({ user: publicUser({ ...u, is_active: active }) });
}));

/* =====================================================
   404 & ERROR HANDLER
===================================================== */
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Format data tidak valid.' });
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Kode barang atau username tersebut sudah digunakan.' });

  console.error('[API ERROR]', err.code || '', err.message);
  const dbCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'PROTOCOL_CONNECTION_LOST', 'ER_ACCESS_DENIED_ERROR',
    'HANDSHAKE_SSL_ERROR', 'ER_BAD_DB_ERROR', 'ER_NO_SUCH_TABLE', 'ECONNRESET'];
  if (dbCodes.includes(err.code)) {
    const hint = err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_DB_ERROR'
      ? 'Tabel belum dibuat. Jalankan database/schema.sql terlebih dahulu.'
      : 'Tidak dapat terhubung ke database TiDB. Periksa konfigurasi koneksi.';
    return res.status(503).json({ error: hint });
  }
  res.status(500).json({ error: err.status ? err.message : 'Terjadi kesalahan pada server.' });
});

module.exports = app;
