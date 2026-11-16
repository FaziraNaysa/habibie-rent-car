// Membuat basis data, tabel, 19 unit tetap, dan akun awal. Aman dijalankan berulang.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const UNIT = [
  ['Pajero Sport', 'Matic', 1000000, 0], ['Agya', 'Manual', 300000, 0], ['Brio Matic', 'Matic', 350000, 0],
  ['Brio Manual', 'Manual', 300000, 0], ['Avanza Hitam', 'Manual', 250000, 0], ['Avanza (1241)', 'Manual', 250000, 0],
  ['Terios Matic', 'Matic', 350000, 0], ['Terios Manual', 'Manual', 300000, 0], ['Innova Solar Manual', 'Manual', 500000, 0],
  ['Innova Solar Matic', 'Matic', 550000, 0], ['Innova Zenix G Hybrid', 'Matic', 600000, 0], ['Innova Zenix Q Modellista', 'Matic', 1000000, 0],
  ['Xpander Manual', 'Manual', 350000, 0], ['Xpander Matic', 'Matic', 400000, 0], ['Xpander Tourer P', 'Manual', 350000, 0],
  ['Xpander Tourer H', 'Matic', 400000, 0], ['Rush', 'Manual', 300000, 0], ['Xenia', 'Manual', 250000, 0],
  ['Hiace', 'Manual', 1300000, 1]            // Hiace hanya disewakan beserta driver (AB-11)
];
// Akun awal: setiap pengelola punya akun sendiri (KF-01). GANTI kata sandi ini sebelum dipakai sungguhan.
const AKUN = [['admin', 'Admin', 'admin123'], ['dimas', 'Dimas', 'dimas123']];

(async () => {
  const dbName = process.env.DB_NAME || 'habibie_rent_car';
  const c = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', port: +(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', multipleStatements: true
  });
  await c.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await c.query(`USE \`${dbName}\``);
  await c.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8'));
  const [[{ n }]] = await c.query('SELECT COUNT(*) n FROM unit');
  if (!n) { await c.query('INSERT INTO unit (nama, transmisi, tarif_harian, dengan_driver) VALUES ?', [UNIT]); console.log('19 unit dimasukkan.'); }
  const [[{ orphan }]] = await c.query('SELECT COUNT(*) AS orphan FROM servis s LEFT JOIN unit u ON u.id = s.unit_id WHERE u.id IS NULL');
  if (orphan) throw new Error(`Migrasi servis dibatalkan: ${orphan} jadwal servis tidak memiliki unit yang cocok.`);
  const [[fk]] = await c.query(`SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'servis' AND COLUMN_NAME = 'unit_id'
      AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1`);
  if (!fk || fk.REFERENCED_TABLE_NAME !== 'unit') {
    if (fk) await c.query(`ALTER TABLE servis DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME.replace(/`/g, '``')}\``);
    await c.query('ALTER TABLE servis ADD CONSTRAINT fk_servis_unit FOREIGN KEY (unit_id) REFERENCES unit(id)');
    console.log('Relasi unit pada jadwal servis diperbarui.');
  }
  for (const [u, nama, pw] of AKUN) {
    await c.query('INSERT IGNORE INTO pengguna (username, nama, password_hash) VALUES (?,?,?)', [u, nama, bcrypt.hashSync(pw, 10)]);
  }
  console.log('Basis data siap:', dbName);
  await c.end();
})().catch((e) => { console.error('Gagal:', e.message); process.exit(1); });
