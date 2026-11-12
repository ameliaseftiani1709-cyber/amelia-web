// server.js — menjalankan aplikasi di komputer lokal: npm run dev
require('dotenv').config();
const path = require('path');
const express = require('express');
const app = require('./server/app');

app.use(express.static(path.join(__dirname, 'public')));

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`✅ LabInv berjalan di http://localhost:${PORT}`);
  console.log('   Akun demo: admin / admin123  |  staff / staff123');
});
