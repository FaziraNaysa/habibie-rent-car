// Menjadikan satu akun Admin aktif tanpa menghapus pengguna lama yang masih direferensikan transaksi.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, tx } = require('./db');

const USERNAME = 'admin.habibie';
const NAME = 'Admin Habibie Rent Car';
const PASSWORD = process.env.ADMIN_INITIAL_PASSWORD;

(async () => {
  await tx(async (c) => {
    const [[target]] = await c.query('SELECT id FROM pengguna WHERE username = ? LIMIT 1 FOR UPDATE', [USERNAME]);
    let id;
    if (target) {
      id = target.id;
      await c.query('UPDATE pengguna SET aktif = 0, gagal_login = 0, terkunci_sampai = NULL WHERE id <> ?', [id]);
      await c.query('UPDATE pengguna SET nama = ?, aktif = 1, gagal_login = 0, terkunci_sampai = NULL WHERE id = ?', [NAME, id]);
    } else {
      if (!PASSWORD || PASSWORD.length < 12) throw new Error('Atur ADMIN_INITIAL_PASSWORD (minimal 12 karakter) pada environment Railway sebelum deploy pertama.');
      const [r] = await c.query('INSERT INTO pengguna (username, nama, password_hash, aktif) VALUES (?,?,?,1)',
        [USERNAME, NAME, bcrypt.hashSync(PASSWORD, 12)]);
      id = r.insertId;
      await c.query('UPDATE pengguna SET aktif = 0, gagal_login = 0, terkunci_sampai = NULL WHERE id <> ?', [id]);
    }
    console.log(`Akun Admin siap. Username: ${USERNAME}. ID: ${id}. Akun lama dinonaktifkan; riwayat transaksi dipertahankan.`);
  });
  await pool.end();
})().catch(async (e) => { console.error('Gagal menyiapkan Admin:', e.message); try { await pool.end(); } catch (_) {} process.exit(1); });
