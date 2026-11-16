// Mengosongkan data pemesanan, pembayaran, servis, dan jejak audit (unit dan akun tetap). Dipakai setelah `npm test`.
require('dotenv').config();
const { pool } = require('./db');
(async () => {
  for (const t of ['jejak_audit', 'pembayaran', 'pemesanan', 'servis', 'kode_urut']) await pool.query(`DELETE FROM ${t}`);
  await pool.query('UPDATE pengguna SET gagal_login = 0, terkunci_sampai = NULL');
  console.log('Data pemesanan, pembayaran, servis, dan jejak audit dikosongkan.');
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
