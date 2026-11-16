// Pemakaian: npm run sandi -- <username> <kata-sandi-baru>
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./db');
(async () => {
  const [u, p] = process.argv.slice(2);
  if (!u || !p || p.length < 8) { console.log('Pemakaian: npm run sandi -- <username> <kata-sandi-baru (minimal 8 karakter)>'); process.exit(1); }
  const [r] = await pool.query('UPDATE pengguna SET password_hash = ?, gagal_login = 0, terkunci_sampai = NULL WHERE username = ?', [bcrypt.hashSync(p, 10), u.toLowerCase()]);
  console.log(r.affectedRows ? `Kata sandi ${u} diganti.` : `Username ${u} tidak ditemukan.`);
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
