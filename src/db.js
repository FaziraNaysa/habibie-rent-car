require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: +(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'habibie_rent_car',
  connectionLimit: 10,
  dateStrings: true,          // DATETIME dikembalikan apa adanya (tanpa konversi zona waktu)
  multipleStatements: false
});
// Semua koneksi memakai zona waktu WIB agar NOW() konsisten (NF-05)
pool.pool.on('connection', (c) => c.query("SET time_zone = '+07:00'"));

// Jalankan fungsi di dalam transaksi; rollback otomatis bila error (NF-03)
async function tx(fn) {
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const r = await fn(c);
    await c.commit();
    return r;
  } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
}
module.exports = { pool, tx };
