require('dotenv').config();
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, tx } = require('./db');

const SECRET = process.env.JWT_SECRET || 'dev-secret-ganti-di-produksi';
const app = express();
app.use(express.json());

/* ===================== Util ===================== */
class Err extends Error { constructor(status, pesan, data) { super(pesan); this.status = status; this.data = data; } }
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const RE_DT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/;
const ms = (s) => new Date(String(s).replace(' ', 'T') + 'Z').getTime();
const hari = (mulai, selesai) => Math.max(1, Math.ceil((ms(selesai) - ms(mulai)) / 864e5)); // per 24 jam, dibulatkan ke atas
function dt(v, nama, kelipatan30 = true) {
  const s = String(v || '').trim();
  if (!RE_DT.test(s) || isNaN(ms(s + ':00'))) throw new Err(400, `${nama} tidak valid (format YYYY-MM-DDTHH:mm).`);
  if (kelipatan30 && +s.slice(14, 16) % 30) throw new Err(400, `${nama} harus dalam kelipatan 30 menit.`);
  return s.replace('T', ' ') + ':00';
}
function int(v, nama, min = 0, max = 2000000000) {
  const n = Number(v);
  if (v === '' || v === null || v === undefined || !Number.isInteger(n) || n < min || n > max) throw new Err(400, `${nama} tidak valid.`);
  return n;
}
const pilih = (v, daftar, def) => {
  if (v === undefined || v === null || v === '') return def;
  if (!daftar.includes(v)) throw new Err(400, `Pilihan tidak valid: ${v}.`);
  return v;
};
const teks = (v, nama, maks, wajib = true) => {
  const s = String(v == null ? '' : v).trim();
  if (wajib && !s) throw new Err(400, `${nama} wajib diisi.`);
  if (s.length > maks) throw new Err(400, `${nama} maksimal ${maks} karakter.`);
  return s || null;
};
function wa(v) {
  const s = String(v || '').replace(/[\s-]/g, '');
  if (!/^(\+62|62|0)8\d{7,12}$/.test(s)) throw new Err(400, 'Nomor WhatsApp tidak valid. Contoh: 081234567890.');
  return s;
}
const rp = (n) => 'Rp' + Number(n).toLocaleString('id-ID');
async function audit(c, user, entitas, id, aksi, detail) {   // NF-06: jejak audit
  await c.query('INSERT INTO jejak_audit (pengguna_id, nama_pengguna, entitas, entitas_id, aksi, detail) VALUES (?,?,?,?,?,?)',
    [user.id, user.nama, entitas, id, aksi, detail ? JSON.stringify(detail) : null]);
}

/* ===================== Autentikasi (KF-01, KF-24, NF-02) ===================== */
app.post('/api/auth/login', wrap(async (req, res) => {
  const username = String((req.body || {}).username || '').trim().toLowerCase();
  const password = String((req.body || {}).password || '');
  const [[u]] = await pool.query(
    `SELECT *, (terkunci_sampai IS NOT NULL AND terkunci_sampai > NOW()) AS terkunci,
     GREATEST(1, TIMESTAMPDIFF(MINUTE, NOW(), terkunci_sampai) + 1) AS sisa_menit FROM pengguna WHERE username = ? AND aktif = 1`, [username]);
  if (u && u.terkunci) throw new Err(423, `Akun terkunci. Coba lagi sekitar ${u.sisa_menit} menit lagi.`);
  if (!u || !bcrypt.compareSync(password, u.password_hash)) {
    if (u) {
      const gagal = u.gagal_login + 1;
      if (gagal >= 5) await pool.query('UPDATE pengguna SET gagal_login = 0, terkunci_sampai = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE id = ?', [u.id]);
      else await pool.query('UPDATE pengguna SET gagal_login = ? WHERE id = ?', [gagal, u.id]);
      if (gagal >= 5) throw new Err(423, 'Akun terkunci selama 15 menit karena 5 kali gagal login.');
    }
    throw new Err(401, 'Email/username atau kata sandi salah.');
  }
  await pool.query('UPDATE pengguna SET gagal_login = 0, terkunci_sampai = NULL WHERE id = ?', [u.id]);
  const token = jwt.sign({ id: u.id, nama: u.nama, username: u.username }, SECRET, { expiresIn: '8h' });
  res.json({ token, pengguna: { id: u.id, nama: u.nama, username: u.username } });
}));
const auth = (req, res, next) => {
  try {
    const t = (req.headers.authorization || '').replace(/^Bearer /, '');
    req.user = jwt.verify(t, SECRET);
    next();
  } catch (e) { next(new Err(401, 'Sesi berakhir. Silakan masuk kembali.')); }
};
app.post('/api/auth/logout', auth, (req, res) => res.json({ ok: true }));   // token dibuang di sisi klien
app.get('/api/auth/saya', auth, (req, res) => res.json(req.user));
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', (req, res, next) => (req.path.startsWith('/auth/login') || req.path === '/health' ? next() : auth(req, res, next)));

/* ===================== Bentrok & kunci unit (AB-01, AB-02, NF-03) ===================== */
async function cariBentrok(c, unitId, mulai, selesai, kecualiId, jeda = 1) {
  const [[b]] = await c.query(
    `SELECT p.kode, p.mulai, p.selesai, p.status, p.dibuat_pada, pg.nama AS penginput
     FROM pemesanan p JOIN pengguna pg ON pg.id = p.dibuat_oleh
     WHERE p.unit_id = ? AND p.id <> ? AND p.status IN ('Menunggu DP','Dibooking','Disewa')
       AND ? < DATE_ADD(IF(p.status = 'Disewa', GREATEST(p.selesai, NOW()), p.selesai), INTERVAL ${jeda ? 1 : 0} HOUR)
       AND DATE_ADD(?, INTERVAL ${jeda ? 1 : 0} HOUR) > p.mulai LIMIT 1`, [unitId, kecualiId || 0, mulai, selesai]);
  return b || null;
}
async function pastikanBebas(c, unitId, mulai, selesai, kecualiId, jeda = 1) {
  const b = await cariBentrok(c, unitId, mulai, selesai, kecualiId, jeda);
  if (b) throw new Err(409, `Bentrok dengan pemesanan ${b.kode} (${b.mulai.slice(0, 16)} – ${b.selesai.slice(0, 16)}, status ${b.status}), dicatat oleh ${b.penginput} pada ${b.dibuat_pada.slice(0, 16)}.${jeda ? ' Jeda minimal 1 jam antar sewa.' : ''}`, { bentrok: b });
  const [[s]] = await c.query('SELECT id, mulai, selesai, alasan FROM servis WHERE unit_id = ? AND mulai < ? AND selesai > ? LIMIT 1', [unitId, selesai, mulai]);
  if (s) throw new Err(409, `Unit dijadwalkan servis pada ${s.mulai.slice(0, 16)} – ${s.selesai.slice(0, 16)}${s.alasan ? ' (' + s.alasan + ')' : ''}.`, { servis: s });
}
const kunciUnit = async (c, id) => {              // kunci baris unit: dua pencatatan bersamaan pada unit yang sama dijalankan bergiliran
  const [[u]] = await c.query('SELECT * FROM unit WHERE id = ? FOR UPDATE', [id]);
  if (!u || !u.aktif) throw new Err(404, 'Unit tidak ditemukan atau tidak aktif.');
  return u;
};
async function buatKode(c) {                      // KF-23: BK-AAMMDD-NNN
  await c.query('INSERT INTO kode_urut (tanggal, n) VALUES (CURDATE(), 1) ON DUPLICATE KEY UPDATE n = n + 1');
  const [[r]] = await c.query("SELECT n, DATE_FORMAT(CURDATE(), '%y%m%d') AS t FROM kode_urut WHERE tanggal = CURDATE()");
  return `BK-${r.t}-${String(r.n).padStart(3, '0')}`;
}

/* ===================== Bentuk data pemesanan ===================== */
const SEL = `SELECT p.*, u.nama AS unit_nama, u.tarif_harian,
  COALESCE((SELECT SUM(b.nominal) FROM pembayaran b WHERE b.pemesanan_id = p.id), 0) AS dibayar,
  pg.nama AS dibuat_oleh_nama, pg2.nama AS diubah_oleh_nama
  FROM pemesanan p LEFT JOIN unit u ON u.id = p.unit_id JOIN pengguna pg ON pg.id = p.dibuat_oleh LEFT JOIN pengguna pg2 ON pg2.id = p.diubah_oleh`;
function bentuk(p) {
  const dibayar = Number(p.dibayar);
  const tagihan = p.total_sewa + p.denda + p.biaya_bbm + p.ganti_rugi;
  const batal = p.status === 'Dibatalkan';
  return { ...p, dibayar, tagihan, sisa: batal ? 0 : Math.max(0, tagihan - dibayar), dp_hangus: batal ? dibayar : 0,
    sumber_unit: p.rekanan_nama ? 'Rekanan' : 'Milik usaha', selisih_rekanan: p.rekanan_nama ? p.total_sewa - p.biaya_rekanan : null };
}
const ambil = async (c, id) => { const [[p]] = await c.query(SEL + ' WHERE p.id = ?', [id]); return p ? bentuk(p) : null; };
const kunciPem = async (c, id) => {
  const [[p]] = await c.query('SELECT * FROM pemesanan WHERE id = ? FOR UPDATE', [id]);
  if (!p) throw new Err(404, 'Pemesanan tidak ditemukan.');
  return p;
};
async function sisaTagihan(c, p, tambahan = {}) {
  const [[{ d }]] = await c.query('SELECT COALESCE(SUM(nominal),0) d FROM pembayaran WHERE pemesanan_id = ?', [p.id]);
  const x = { denda: p.denda, biaya_bbm: p.biaya_bbm, ganti_rugi: p.ganti_rugi, ...tambahan };
  return p.total_sewa + x.denda + x.biaya_bbm + x.ganti_rugi - Number(d);
}

/* ===================== Unit & ketersediaan (KF-04, KF-08) ===================== */
app.get('/api/unit', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.*, CASE
       WHEN EXISTS (SELECT 1 FROM pemesanan p WHERE p.unit_id = u.id AND p.status = 'Disewa') THEN 'Disewa'
       WHEN EXISTS (SELECT 1 FROM servis s WHERE s.unit_id = u.id AND s.mulai <= NOW() AND s.selesai > NOW()) THEN 'Servis'
       WHEN EXISTS (SELECT 1 FROM pemesanan p WHERE p.unit_id = u.id AND p.status IN ('Menunggu DP','Dibooking') AND p.mulai <= NOW() AND p.selesai > NOW()) THEN 'Dibooking'
       ELSE 'Tersedia' END AS status_sekarang
     FROM unit u WHERE u.aktif = 1 ORDER BY u.id`);
  res.json(rows);
}));
app.get('/api/ketersediaan', wrap(async (req, res) => {
  const mulai = dt(req.query.mulai, 'Waktu ambil'), selesai = dt(req.query.selesai, 'Waktu kembali');
  if (ms(selesai) <= ms(mulai)) throw new Err(400, 'Waktu kembali harus setelah waktu ambil.');
  const trans = pilih(req.query.transmisi, ['Manual', 'Matic'], null);
  const [units] = await pool.query('SELECT * FROM unit WHERE aktif = 1' + (trans ? ' AND transmisi = ?' : '') + ' ORDER BY id', trans ? [trans] : []);
  const hasil = [];
  for (const u of units) {
    const b = await cariBentrok(pool, u.id, mulai, selesai, 0);
    const [[s]] = await pool.query('SELECT mulai, selesai, alasan FROM servis WHERE unit_id = ? AND mulai < ? AND selesai > ? LIMIT 1', [u.id, selesai, mulai]);
    hasil.push({ ...u, tersedia: !b && !s, alasan: b ? { jenis: b.status === 'Menunggu DP' ? 'Ditahan (Menunggu DP)' : b.status, kode: b.kode, mulai: b.mulai, selesai: b.selesai } : s ? { jenis: 'Servis', mulai: s.mulai, selesai: s.selesai } : null });
  }
  res.json(hasil);
}));

/* ===================== Pemesanan (KF-05, KF-06, KF-07, KF-09, KF-11, KF-13, KF-22, KF-23) ===================== */
app.post('/api/pemesanan', wrap(async (req, res) => {
  const b = req.body || {};
  const nama = teks(b.nama_pelanggan, 'Nama pelanggan', 100), no = wa(b.no_wa);
  const mulai = dt(b.mulai, 'Waktu ambil'), selesai = dt(b.selesai, 'Waktu kembali');
  if (ms(selesai) <= ms(mulai)) throw new Err(400, 'Waktu kembali harus setelah waktu ambil.');
  const jenis = pilih(b.jenis_sewa, ['Harian', 'Kontrak'], 'Harian');
  const sumber = pilih(b.sumber, ['WhatsApp', 'Telepon', 'Datang langsung'], 'WhatsApp');
  const jaminan = pilih(b.jaminan, ['KTP', 'Kendaraan bermotor'], null);
  const um = b.uang_muka === undefined || b.uang_muka === '' ? 0 : int(b.uang_muka, 'Uang muka');
  const catatan = teks(b.catatan, 'Catatan', 255, false);
  const bbmAmbil = int(b.bbm_ambil, 'Level bahan bakar saat diambil (0–8 bar)', 0, 8);   // dicatat sejak booking agar tidak terlupa
  const kondisiAmbil = teks(b.kondisi_ambil, 'Kondisi unit saat diambil', 255, false);

  const baru = await tx(async (c) => {
    let unitId = null, total, dengan = b.dengan_driver ? 1 : 0, rk = [null, null, null];
    if (b.rekanan) {                                       // AB-12: unit rekanan tidak diperiksa benturannya
      const r = b.rekanan;
      rk = [teks(r.nama, 'Nama rekanan', 100), teks(r.unit, 'Unit/plat rekanan', 100), int(r.biaya, 'Biaya sewa ke rekanan')];
      total = int(r.harga, 'Harga ke pelanggan', 1);
    } else {
      unitId = int(b.unit_id, 'Unit', 1);
      const u = await kunciUnit(c, unitId);
      await pastikanBebas(c, unitId, mulai, selesai, 0);   // AB-01, AB-02, KF-06
      total = u.tarif_harian * hari(mulai, selesai);
      if (u.dengan_driver) dengan = 1;                     // AB-11: Hiace selalu dengan driver
    }
    if (um > total) throw new Err(400, `Uang muka melebihi total sewa (${rp(total)}).`);
    const kode = await buatKode(c);
    const [r] = await c.query(
      `INSERT INTO pemesanan (kode, nama_pelanggan, no_wa, unit_id, rekanan_nama, rekanan_unit, biaya_rekanan, mulai, selesai, jenis_sewa, sumber,
        dengan_driver, catatan, total_sewa, status, jaminan, bbm_ambil, kondisi_ambil, dibuat_oleh) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [kode, nama, no, unitId, rk[0], rk[1], rk[2], mulai, selesai, jenis, sumber, dengan, catatan, total, um > 0 ? 'Dibooking' : 'Menunggu DP', jaminan, bbmAmbil, kondisiAmbil, req.user.id]);
    if (um > 0) await c.query("INSERT INTO pembayaran (pemesanan_id, jenis, nominal, dicatat_oleh) VALUES (?, 'DP', ?, ?)", [r.insertId, um, req.user.id]);
    await audit(c, req.user, 'pemesanan', r.insertId, 'dibuat', { kode, total, uang_muka: um });
    return ambil(c, r.insertId);
  });
  res.status(201).json(baru);
}));

app.get('/api/pemesanan', wrap(async (req, res) => {
  const w = [], p = [], q = req.query;
  if (q.status) { w.push('p.status = ?'); p.push(pilih(q.status, ['Menunggu DP', 'Dibooking', 'Disewa', 'Selesai', 'Dibatalkan'])); }
  if (q.unit_id) { w.push('p.unit_id = ?'); p.push(int(q.unit_id, 'Unit', 1)); }
  if (q.dari) { w.push('p.selesai >= ?'); p.push(q.dari + ' 00:00:00'); }
  if (q.sampai) { w.push('p.mulai <= ?'); p.push(q.sampai + ' 23:59:59'); }
  if (q.q) { w.push('(p.nama_pelanggan LIKE ? OR p.kode LIKE ?)'); p.push('%' + q.q + '%', '%' + q.q + '%'); }
  const [rows] = await pool.query(SEL + (w.length ? ' WHERE ' + w.join(' AND ') : '') + ' ORDER BY p.mulai DESC LIMIT 500', p);
  res.json(rows.map(bentuk));
}));
app.get('/api/pemesanan/:id', wrap(async (req, res) => {
  const p = await ambil(pool, int(req.params.id, 'ID', 1));
  if (!p) throw new Err(404, 'Pemesanan tidak ditemukan.');
  const [bayar] = await pool.query('SELECT b.id, b.jenis, b.nominal, b.waktu, g.nama AS dicatat_oleh FROM pembayaran b JOIN pengguna g ON g.id = b.dicatat_oleh WHERE b.pemesanan_id = ? ORDER BY b.id', [p.id]);
  const [log] = await pool.query("SELECT waktu, nama_pengguna, aksi, detail FROM jejak_audit WHERE entitas = 'pemesanan' AND entitas_id = ? ORDER BY id", [p.id]);
  res.json({ ...p, pembayaran: bayar, jejak_audit: log });
}));

// Ubah pemesanan (KF-13). Juga dipakai untuk perpanjang sewa: ubah "selesai" pada pemesanan berstatus Disewa.
app.patch('/api/pemesanan/:id', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID', 1), b = req.body || {};
  const hasil = await tx(async (c) => {
    const p = await kunciPem(c, id);
    if (['Selesai', 'Dibatalkan'].includes(p.status)) throw new Err(409, `Pemesanan berstatus ${p.status} tidak dapat diubah.`);
    const sewa = p.status === 'Disewa', set = {};
    if (b.nama_pelanggan !== undefined) set.nama_pelanggan = teks(b.nama_pelanggan, 'Nama pelanggan', 100);
    if (b.no_wa !== undefined) set.no_wa = wa(b.no_wa);
    if (b.catatan !== undefined) set.catatan = teks(b.catatan, 'Catatan', 255, false);
    if (b.jenis_sewa !== undefined) set.jenis_sewa = pilih(b.jenis_sewa, ['Harian', 'Kontrak']);
    if (b.sumber !== undefined) set.sumber = pilih(b.sumber, ['WhatsApp', 'Telepon', 'Datang langsung']);
    if (b.bbm_ambil !== undefined) { if (sewa) throw new Err(409, 'Level BBM saat diambil tidak dapat diubah setelah unit diambil.'); set.bbm_ambil = int(b.bbm_ambil, 'Level bahan bakar saat diambil (0–8 bar)', 0, 8); }
    if (b.jaminan !== undefined) set.jaminan = pilih(b.jaminan, ['KTP', 'Kendaraan bermotor'], null);
    let mulai = p.mulai, selesai = p.selesai, unitId = p.unit_id, dengan = p.dengan_driver, total = p.total_sewa;
    if (b.mulai !== undefined) { if (sewa) throw new Err(409, 'Waktu ambil tidak dapat diubah setelah unit diambil.'); mulai = dt(b.mulai, 'Waktu ambil'); }
    if (b.selesai !== undefined) selesai = dt(b.selesai, 'Waktu kembali');
    if (ms(selesai) <= ms(mulai)) throw new Err(400, 'Waktu kembali harus setelah waktu ambil.');
    if (b.dengan_driver !== undefined) dengan = b.dengan_driver ? 1 : 0;
    if (p.rekanan_nama) {
      if (b.rekanan) {
        if (b.rekanan.nama !== undefined) set.rekanan_nama = teks(b.rekanan.nama, 'Nama rekanan', 100);
        if (b.rekanan.unit !== undefined) set.rekanan_unit = teks(b.rekanan.unit, 'Unit/plat rekanan', 100);
        if (b.rekanan.biaya !== undefined) set.biaya_rekanan = int(b.rekanan.biaya, 'Biaya sewa ke rekanan');
        if (b.rekanan.harga !== undefined) total = int(b.rekanan.harga, 'Harga ke pelanggan', 1);
      }
    } else {
      if (b.unit_id !== undefined) { if (sewa) throw new Err(409, 'Unit tidak dapat diganti setelah unit diambil.'); unitId = int(b.unit_id, 'Unit', 1); }
      const u = await kunciUnit(c, unitId);
      if (unitId !== p.unit_id || mulai !== p.mulai || selesai !== p.selesai) await pastikanBebas(c, unitId, mulai, selesai, id);   // periksa ulang benturan
      total = u.tarif_harian * hari(mulai, selesai);
      if (u.dengan_driver) dengan = 1;
    }
    Object.assign(set, { mulai, selesai, unit_id: unitId, dengan_driver: dengan, total_sewa: total });
    const perubahan = {};
    for (const k of Object.keys(set)) if (String(set[k] ?? '') !== String(p[k] ?? '')) perubahan[k] = [p[k], set[k]];
    if (!Object.keys(perubahan).length) return ambil(c, id);
    await c.query('UPDATE pemesanan SET ?, diubah_oleh = ?, diubah_pada = NOW() WHERE id = ?', [set, req.user.id, id]);
    await audit(c, req.user, 'pemesanan', id, p.status === 'Disewa' && perubahan.selesai ? 'diperpanjang' : 'diubah', perubahan);
    return ambil(c, id);
  });
  res.json(hasil);
}));

// Catat DP / pelunasan (KF-14). Pencatatan pertama pada status Menunggu DP mengubahnya menjadi Dibooking (KF-07).
app.post('/api/pemesanan/:id/pembayaran', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID', 1), jenis = pilih((req.body || {}).jenis, ['DP', 'Pelunasan']);
  if (!jenis) throw new Err(400, 'Jenis pembayaran wajib diisi (DP atau Pelunasan).');
  const nominal = int((req.body || {}).nominal, 'Nominal', 1);
  const hasil = await tx(async (c) => {
    const p = await kunciPem(c, id);
    if (p.status === 'Dibatalkan') throw new Err(409, 'Pemesanan sudah dibatalkan.');
    const sisa = await sisaTagihan(c, p);
    if (nominal > sisa) throw new Err(400, `Nominal melebihi sisa pembayaran (${rp(Math.max(0, sisa))}).`);
    await c.query('INSERT INTO pembayaran (pemesanan_id, jenis, nominal, dicatat_oleh) VALUES (?,?,?,?)', [id, jenis, nominal, req.user.id]);
    if (p.status === 'Menunggu DP') await c.query("UPDATE pemesanan SET status = 'Dibooking', diubah_oleh = ?, diubah_pada = NOW() WHERE id = ?", [req.user.id, id]);
    await audit(c, req.user, 'pemesanan', id, 'pembayaran', { jenis, nominal });
    return ambil(c, id);
  });
  res.status(201).json(hasil);
}));

// Pengambilan unit (KF-20): Dibooking -> Disewa; simpan jaminan (KF-15), BBM (KF-17), kondisi (KF-18).
app.post('/api/pemesanan/:id/pengambilan', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID', 1), b = req.body || {};
  const hasil = await tx(async (c) => {
    const p = await kunciPem(c, id);
    if (p.status === 'Menunggu DP') throw new Err(409, 'Uang muka belum dicatat. Catat DP terlebih dahulu.');
    if (p.status !== 'Dibooking') throw new Err(409, `Pengambilan hanya untuk pemesanan berstatus Dibooking (saat ini ${p.status}).`);
    const jaminan = pilih(b.jaminan, ['KTP', 'Kendaraan bermotor'], p.jaminan);
    if (!jaminan) throw new Err(400, 'Jenis jaminan wajib dipilih (KTP atau Kendaraan bermotor).');
    const bbm = b.bbm_ambil === undefined ? p.bbm_ambil : int(b.bbm_ambil, 'Level bahan bakar saat diambil', 0, 8), kondisi = teks(b.kondisi_ambil, 'Kondisi unit', 255, false);
    if (bbm === null) throw new Err(400, 'Level BBM saat diambil belum diisi.');
    await c.query("UPDATE pemesanan SET status = 'Disewa', waktu_ambil = NOW(), jaminan = ?, bbm_ambil = ?, kondisi_ambil = ?, diubah_oleh = ?, diubah_pada = NOW() WHERE id = ?",
      [jaminan, bbm, kondisi, req.user.id, id]);
    await audit(c, req.user, 'pemesanan', id, 'pengambilan', { jaminan, bbm_ambil: bbm, kondisi_ambil: kondisi });
    return ambil(c, id);
  });
  res.json(hasil);
}));

// Pengembalian unit (KF-21): Disewa -> Selesai. Denda, biaya BBM, dan ganti rugi dihitung pengelola; sistem hanya mencatat nominalnya (AB-06).
app.post('/api/pemesanan/:id/pengembalian', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID', 1), b = req.body || {};
  const hasil = await tx(async (c) => {
    const p = await kunciPem(c, id);
    if (p.status !== 'Disewa') throw new Err(409, `Pengembalian hanya untuk pemesanan berstatus Disewa (saat ini ${p.status}).`);
    if (!b.waktu_kembali) throw new Err(400, 'Waktu kembali wajib diisi.');
    const kembali = dt(b.waktu_kembali, 'Waktu kembali', false);
    const a = new Date(ms(p.waktu_ambil)); a.setUTCMinutes(a.getUTCMinutes() < 30 ? 0 : 30, 0, 0);
    if (ms(kembali) < a.getTime()) throw new Err(400, `Waktu kembali tidak boleh lebih awal dari waktu pengambilan (${p.waktu_ambil.slice(0, 16)}).`);
    const x = { denda: int(b.denda ?? 0, 'Denda'), biaya_bbm: int(b.biaya_bbm ?? 0, 'Biaya bahan bakar'), ganti_rugi: int(b.ganti_rugi ?? 0, 'Ganti rugi') };
    const bbm = int(b.bbm_kembali, 'Level bahan bakar', 0, 8), kondisi = teks(b.kondisi_kembali, 'Kondisi unit', 255, false);
    const bayar = b.pembayaran === undefined || b.pembayaran === '' ? 0 : int(b.pembayaran, 'Pembayaran');
    if (bayar > 0) { const sisa = await sisaTagihan(c, p, x); if (bayar > sisa) throw new Err(400, `Pembayaran melebihi sisa tagihan (${rp(Math.max(0, sisa))}).`); }
    await c.query(`UPDATE pemesanan SET status = 'Selesai', waktu_kembali = ?, bbm_kembali = ?, kondisi_kembali = ?,
      denda = ?, biaya_bbm = ?, ganti_rugi = ?, diubah_oleh = ?, diubah_pada = NOW() WHERE id = ?`, [kembali, bbm, kondisi, x.denda, x.biaya_bbm, x.ganti_rugi, req.user.id, id]);
    if (bayar > 0) await c.query("INSERT INTO pembayaran (pemesanan_id, jenis, nominal, dicatat_oleh) VALUES (?, 'Pelunasan', ?, ?)", [id, bayar, req.user.id]);
    await audit(c, req.user, 'pemesanan', id, 'pengembalian', { ...x, bbm_kembali: bbm, kondisi_kembali: kondisi, pembayaran: bayar });
    return ambil(c, id);
  });
  res.json(hasil);
}));

// Pembatalan (AB-09, AB-10, AB-15): hanya Menunggu DP dan Dibooking. Uang muka yang sudah dibayar hangus.
app.post('/api/pemesanan/:id/batal', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID', 1);
  const hasil = await tx(async (c) => {
    const p = await kunciPem(c, id);
    if (p.status === 'Disewa') throw new Err(409, 'Pemesanan yang sudah berstatus Disewa tidak dapat dibatalkan.');
    if (!['Menunggu DP', 'Dibooking'].includes(p.status)) throw new Err(409, `Pemesanan berstatus ${p.status} tidak dapat dibatalkan.`);
    await c.query("UPDATE pemesanan SET status = 'Dibatalkan', diubah_oleh = ?, diubah_pada = NOW() WHERE id = ?", [req.user.id, id]);
    const r = await ambil(c, id);
    await audit(c, req.user, 'pemesanan', id, 'dibatalkan', { dp_hangus: r.dp_hangus });
    return r;
  });
  res.json(hasil);
}));

/* ===================== Jadwal & servis (KF-12, KF-19) ===================== */
app.get('/api/jadwal', wrap(async (req, res) => {
  const dari = (req.query.dari || '1970-01-01') + ' 00:00:00', sampai = (req.query.sampai || '2999-12-31') + ' 23:59:59';
  const w = ["p.status <> 'Dibatalkan'", 'p.selesai >= ?', 'p.mulai <= ?'], par = [dari, sampai];
  if (req.query.unit_id) { w.push('p.unit_id = ?'); par.push(int(req.query.unit_id, 'Unit', 1)); }
  const [pem] = await pool.query(SEL + ' WHERE ' + w.join(' AND ') + ' ORDER BY p.mulai', par);
  const [svs] = await pool.query('SELECT s.*, u.nama AS unit_nama FROM servis s JOIN unit u ON u.id = s.unit_id WHERE s.selesai >= ? AND s.mulai <= ?' + (req.query.unit_id ? ' AND s.unit_id = ?' : '') + ' ORDER BY s.mulai',
    req.query.unit_id ? [dari, sampai, int(req.query.unit_id, 'Unit', 1)] : [dari, sampai]);
  res.json({ pemesanan: pem.map(bentuk), servis: svs });
}));
app.get('/api/servis', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT s.*, u.nama AS unit_nama, g.nama AS dibuat_oleh_nama FROM servis s JOIN unit u ON u.id = s.unit_id JOIN pengguna g ON g.id = s.dibuat_oleh ORDER BY s.mulai DESC');
  res.json(rows);
}));
app.post('/api/servis', wrap(async (req, res) => {
  const b = req.body || {}, unitId = int(b.unit_id, 'Unit', 1);
  const mulai = dt(b.mulai, 'Waktu mulai servis'), selesai = dt(b.selesai, 'Waktu selesai servis'), alasan = teks(b.alasan, 'Alasan', 255, false);
  if (ms(selesai) <= ms(mulai)) throw new Err(400, 'Waktu selesai servis harus setelah waktu mulai.');
  const baru = await tx(async (c) => {
    await kunciUnit(c, unitId);
    await pastikanBebas(c, unitId, mulai, selesai, 0, 0);   // servis hanya ditolak jika waktunya benar-benar bertumpang tindih
    const [r] = await c.query('INSERT INTO servis (unit_id, mulai, selesai, alasan, dibuat_oleh) VALUES (?,?,?,?,?)', [unitId, mulai, selesai, alasan, req.user.id]);
    await audit(c, req.user, 'servis', r.insertId, 'dibuat', { unit_id: unitId, mulai, selesai, alasan });
    return { id: r.insertId, unit_id: unitId, mulai, selesai, alasan };
  });
  res.status(201).json(baru);
}));
app.delete('/api/servis/:id', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID', 1);
  await tx(async (c) => {
    const [r] = await c.query('DELETE FROM servis WHERE id = ?', [id]);
    if (!r.affectedRows) throw new Err(404, 'Jadwal servis tidak ditemukan.');
    await audit(c, req.user, 'servis', id, 'dihapus', null);
  });
  res.json({ ok: true });
}));

/* ===================== Laporan (rekap booking dan pemasukan) ===================== */
app.get('/api/laporan', wrap(async (req, res) => {
  const tahun = int(req.query.tahun || new Date().getFullYear(), 'Tahun', 2000, 2100);
  const bulan = req.query.bulan ? int(req.query.bulan, 'Bulan', 1, 12) : null;
  const dari = bulan ? new Date(Date.UTC(tahun, bulan - 1, 1)) : new Date(Date.UTC(tahun, 0, 1));
  const sampai = bulan ? new Date(Date.UTC(tahun, bulan, 1)) : new Date(Date.UTC(tahun + 1, 0, 1));
  const f = (d) => d.toISOString().slice(0, 10) + ' 00:00:00';
  const [rows] = await pool.query(SEL + ' WHERE p.mulai >= ? AND p.mulai < ? ORDER BY p.mulai', [f(dari), f(sampai)]);
  const L = rows.map(bentuk), ok = L.filter((p) => p.status !== 'Dibatalkan'), bt = L.filter((p) => p.status === 'Dibatalkan');
  const jum = (arr, fn) => arr.reduce((a, p) => a + fn(p), 0);
  const kelompok = (arr, kunci, nama) => {
    const m = {};
    for (const p of arr) { const k = kunci(p); const g = (m[k] = m[k] || { nama: nama(p), jumlah_pemesanan: 0, total_tagihan: 0, dibayar: 0 }); g.jumlah_pemesanan++; g.total_tagihan += p.status === 'Dibatalkan' ? 0 : p.tagihan; g.dibayar += p.dibayar; }
    return Object.values(m).sort((a, b) => b.dibayar - a.dibayar);
  };
  res.json({
    periode: { tahun, bulan },
    ringkasan: { pemasukan_diterima: jum(L, (p) => p.dibayar), total_tagihan: jum(ok, (p) => p.tagihan), belum_dibayar: jum(ok, (p) => p.sisa),
      jumlah_pemesanan: ok.length, jumlah_dibatalkan: bt.length, dp_hangus: jum(bt, (p) => p.dibayar), selisih_rekanan: jum(ok.filter((p) => p.rekanan_nama), (p) => p.selisih_rekanan) },
    per_pelanggan: kelompok(L, (p) => p.nama_pelanggan.toLowerCase() + '|' + p.no_wa, (p) => p.nama_pelanggan),
    per_unit: kelompok(ok, (p) => p.unit_nama || 'Rekanan', (p) => p.unit_nama || 'Rekanan'),
    daftar: L
  });
}));

/* ===================== Berkas statis (frontend) & penanganan galat ===================== */
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api', (req, res) => res.status(404).json({ pesan: 'Endpoint tidak ditemukan.' }));
app.use((e, req, res, next) => {
  if (e instanceof Err) return res.status(e.status).json({ pesan: e.message, ...(e.data || {}) });
  if (e.type === 'entity.parse.failed') return res.status(400).json({ pesan: 'Format JSON tidak valid.' });
  console.error(e);
  res.status(500).json({ pesan: 'Terjadi kesalahan pada server.' });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Habibie Rent Car berjalan di http://localhost:${port}`));
}
module.exports = app;
