// server/db.js — koneksi ke TiDB (kompatibel MySQL) memakai mysql2
const mysql = require('mysql2/promise');

let pool;

function getPool() {
  if (pool) return pool;

  const missing = ['TIDB_HOST', 'TIDB_USER', 'TIDB_PASSWORD'].filter((k) => !process.env[k]);
  if (missing.length) {
    const err = new Error(`Konfigurasi database belum lengkap: ${missing.join(', ')} belum diisi.`);
    err.status = 500;
    throw err;
  }

  pool = mysql.createPool({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT || 4000),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE || 'lab_inventory',
    // TiDB Cloud wajib TLS. Set TIDB_SSL=false hanya untuk TiDB lokal (tiup playground).
    ssl: process.env.TIDB_SSL === 'false' ? undefined : { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    waitForConnections: true,
    connectionLimit: 5,
    maxIdle: 5,
    idleTimeout: 60000,
    enableKeepAlive: true,
    connectTimeout: 10000,
    decimalNumbers: true,   // SUM() dikembalikan sebagai number, bukan string
    dateStrings: ['DATE'],  // kolom DATE tetap "YYYY-MM-DD" (tidak bergeser zona waktu)
    timezone: 'Z',
  });

  // Semua TIMESTAMP dibaca dalam UTC, browser yang mengubah ke waktu lokal
  pool.on('connection', (conn) => {
    const core = conn.connection || conn;
    core.query("SET time_zone = '+00:00'", () => {});
  });

  return pool;
}

async function query(sql, params = []) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}

async function tx(work) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* abaikan */ }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { getPool, query, tx };
