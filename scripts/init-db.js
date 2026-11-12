// scripts/init-db.js — membuat tabel & data demo di TiDB: npm run db:init
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT || 4000),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    ssl: process.env.TIDB_SSL === 'false' ? undefined : { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    multipleStatements: true,
    connectTimeout: 15000,
  });
  console.log('⏳ Terhubung ke TiDB, membuat tabel dan data demo...');
  await conn.query("SET time_zone = '+00:00'");
  const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  await conn.query(sql);
  const [[c]] = await conn.query('SELECT (SELECT COUNT(*) FROM lab_inventory.items) AS items, (SELECT COUNT(*) FROM lab_inventory.users) AS users');
  console.log(`✅ Database siap: ${c.items} barang, ${c.users} pengguna.`);
  console.log('   Akun demo: admin / admin123  |  staff / staff123');
  await conn.end();
})().catch((err) => {
  console.error('❌ Gagal:', err.code || '', err.message);
  process.exit(1);
});
