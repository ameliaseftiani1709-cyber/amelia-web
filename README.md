# LabInv (TiDB) — Laboratory Inventory & Borrowing Management System

Aplikasi web inventaris dan peminjaman barang laboratorium komputer.

- Frontend: HTML, CSS, JavaScript (tanpa framework) di folder `public/`
- Backend: Node.js + Express (REST API) di folder `server/`
- Database: TiDB Cloud (kompatibel MySQL)
- Hosting: Vercel (frontend statis + API sebagai Serverless Function)

## Akun demo

| Role  | Username | Password |
|-------|----------|----------|
| Admin | admin    | admin123 |
| Staff | staff    | staff123 |

Akun demo juga tampil di halaman login dan bisa diklik untuk langsung masuk.

## Struktur folder

```
lab-inventory-tidb/
├── api/index.js          Entry Serverless Function untuk Vercel
├── server/
│   ├── app.js            Semua endpoint REST API
│   ├── db.js             Koneksi pool ke TiDB
│   └── auth.js           Hash password & token login
├── public/               Frontend
│   ├── index.html
│   ├── css/style.css
│   └── js/ (api.js, ui.js, pages.js, app.js)
├── database/schema.sql   Tabel + data barang + akun demo
├── scripts/init-db.js    Menjalankan schema.sql ke TiDB
├── server.js             Server lokal
├── package.json
├── vercel.json
└── .env.example
```

## 1. Siapkan TiDB Cloud

1. Daftar di https://tidbcloud.com lalu buat cluster gratis (Starter/Serverless).
2. Klik **Connect** pada cluster, pilih koneksi umum (General), lalu generate password.
3. Catat host, port (4000), user (formatnya `xxxx.root`), dan password.

## 2. Jalankan di komputer

Butuh Node.js versi 18 atau lebih baru.

```bash
npm install
copy .env.example .env    # Mac/Linux: cp .env.example .env
# isi .env dengan data koneksi TiDB
npm run db:init           # membuat tabel, data barang, dan akun demo
npm run dev               # buka http://localhost:3000
```

Alternatif tanpa `db:init`: buka SQL Editor di TiDB Cloud, tempel isi `database/schema.sql`, lalu jalankan.

## 3. Hosting di Vercel

1. Push folder ini ke GitHub (`.env` tidak ikut karena ada di `.gitignore`).
2. Di Vercel: **Add New → Project**, import repository, Framework Preset **Other**.
3. Isi **Environment Variables**: `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD`, `TIDB_DATABASE`, `JWT_SECRET`.
4. Klik **Deploy**. Cek koneksi database di `https://nama-app.vercel.app/api/health`.

## Endpoint API

| Method | Endpoint | Akses |
|---|---|---|
| POST | /api/auth/login | Publik |
| GET | /api/auth/me | Login |
| GET | /api/dashboard | Admin & Staff |
| GET | /api/items | Admin & Staff |
| POST, PUT, DELETE | /api/items, /api/items/:id | Admin |
| GET, POST | /api/transactions | Admin & Staff |
| POST | /api/transactions/:id/return | Admin & Staff |
| GET, POST, PUT | /api/users, /api/users/:id | Admin |
| PATCH | /api/users/:id/status | Admin |
| GET | /api/health | Publik |

## Teknologi

HTML, CSS, JavaScript, Node.js, Express, mysql2, TiDB Cloud, Vercel.
