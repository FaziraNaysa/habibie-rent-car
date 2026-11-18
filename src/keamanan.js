/* Modul keamanan: tanpa dependensi tambahan.
   - pastikanSecret : memastikan JWT_SECRET sudah diisi dengan nilai yang layak
   - headerKeamanan : header keamanan standar pada semua respons
   - perlindunganCsrf: menolak permintaan pengubah data yang bukan berasal dari aplikasi ini (CSRF) */

const HEADER_CSRF = 'x-requested-with';
const NILAI_CSRF = 'HabibieRentCar';          // frontend (public/js/app.js) wajib mengirim header ini pada setiap permintaan
const CONTOH_BAWAAN = ['ganti-dengan', 'isi-dengan', 'dev-secret'];   // teks contoh dari .env.example / PANDUAN / kode lama

function pastikanSecret(nilai) {
  const s = String(nilai || '').trim();
  const cara = ' Buat nilai acak dengan: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" ' +
    'lalu isi JWT_SECRET di file .env (atau di Variables pada Railway).';
  if (!s) throw new Error('JWT_SECRET belum diisi.' + cara);
  if (s.length < 16) throw new Error('JWT_SECRET terlalu pendek (minimal 16 karakter).' + cara);
  if (CONTOH_BAWAAN.some((k) => s.toLowerCase().includes(k))) throw new Error('JWT_SECRET masih berisi teks contoh bawaan.' + cara);
  return s;
}

// Aplikasi ini hanya memuat berkas dari asalnya sendiri. 'unsafe-inline' hanya untuk gaya (style), bukan skrip.
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data:",
  "connect-src 'self'", "font-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');

function headerKeamanan(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', CSP);
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  if (String(req.path || req.url || '').startsWith('/api')) res.setHeader('Cache-Control', 'no-store');   // data pemesanan tidak boleh tersimpan di cache
  next();
}

const AMAN = new Set(['GET', 'HEAD', 'OPTIONS']);
function tolak(res) {
  res.status(403).json({ pesan: 'Permintaan ditolak karena gagal verifikasi keamanan. Muat ulang halaman lalu coba lagi.' });
}
function perlindunganCsrf(req, res, next) {
  if (AMAN.has(req.method)) return next();
  // 1) Permintaan harus membawa header khusus. Form/situs lain tidak dapat menambahkannya tanpa izin CORS.
  if (req.headers[HEADER_CSRF] !== NILAI_CSRF) return tolak(res);
  // 2) Browser modern menyebut asal permintaan; selain dari situs ini ditolak.
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return tolak(res);
  // 3) Jika ada header Origin, host-nya harus sama dengan host yang diakses.
  const origin = req.headers.origin;
  if (origin !== undefined) {
    let host = null;
    try { host = new URL(origin).host; } catch (e) { /* origin tidak valid */ }
    if (!host || host !== req.headers.host) return tolak(res);
  }
  next();
}

module.exports = { pastikanSecret, headerKeamanan, perlindunganCsrf, HEADER_CSRF, NILAI_CSRF };
