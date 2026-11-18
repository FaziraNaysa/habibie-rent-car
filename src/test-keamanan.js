// Tes modul keamanan. TIDAK memakai basis data dan aman dijalankan kapan saja: `npm run test:keamanan`
const { pastikanSecret, headerKeamanan, perlindunganCsrf, NILAI_CSRF } = require('./keamanan');
let ok = 0, gagal = 0;
const cek = (nama, kondisi, info = '') => { kondisi ? ok++ : gagal++; console.log((kondisi ? '  ✓ ' : '  ✗ ') + nama + (kondisi ? '' : '  -> ' + info)); };

// Pemalsu respons/permintaan sederhana
function jalankan(mw, req) {
  const h = {}; let lolos = false, status = null, body = null;
  const res = { setHeader: (k, v) => { h[k.toLowerCase()] = v; }, status(s) { status = s; return this; }, json(b) { body = b; return this; } };
  mw({ headers: {}, method: 'GET', path: '/', ...req }, res, () => { lolos = true; });
  return { h, lolos, status, body };
}
const mengeluh = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

console.log('JWT_SECRET');
cek('kosong ditolak', /belum diisi/.test(mengeluh(() => pastikanSecret(''))));
cek('tidak ada (undefined) ditolak', /belum diisi/.test(mengeluh(() => pastikanSecret(undefined))));
cek('terlalu pendek ditolak', /terlalu pendek/.test(mengeluh(() => pastikanSecret('abc123'))));
cek('teks contoh .env.example ditolak', /contoh bawaan/.test(mengeluh(() => pastikanSecret('ganti-dengan-teks-acak-panjang'))));
cek('teks contoh PANDUAN ditolak', /contoh bawaan/.test(mengeluh(() => pastikanSecret('isi-dengan-teks-acak-panjang-buatan-sendiri'))));
cek('nilai bawaan kode lama ditolak', /contoh bawaan/.test(mengeluh(() => pastikanSecret('dev-secret-ganti-di-produksi'))));
cek('nilai acak yang layak diterima', pastikanSecret('9f2c41d7a0b3e85c6d1f7a2b4c8e0913') === '9f2c41d7a0b3e85c6d1f7a2b4c8e0913');
cek('pesan galat memuat cara membuat nilai', /randomBytes/.test(mengeluh(() => pastikanSecret(''))));

console.log('Header keamanan');
let r = jalankan(headerKeamanan, { path: '/index.html' });
cek('nosniff, anti-iframe, referrer', r.h['x-content-type-options'] === 'nosniff' && r.h['x-frame-options'] === 'DENY' && r.h['referrer-policy'] === 'no-referrer' && r.lolos);
cek('CSP melarang skrip inline & pihak luar', /script-src 'self'(;|$)/.test(r.h['content-security-policy']) && !/script-src[^;]*unsafe-inline/.test(r.h['content-security-policy']) && /frame-ancestors 'none'/.test(r.h['content-security-policy']));
cek('halaman statis tidak diberi no-store', r.h['cache-control'] === undefined);
cek('tanpa HTTPS tidak ada HSTS', r.h['strict-transport-security'] === undefined);
r = jalankan(headerKeamanan, { path: '/api/pemesanan' });
cek('respons API tidak boleh di-cache', r.h['cache-control'] === 'no-store');
r = jalankan(headerKeamanan, { headers: { 'x-forwarded-proto': 'https' } });
cek('lewat HTTPS dikirim HSTS', /max-age=\d+/.test(r.h['strict-transport-security'] || ''));

console.log('Perlindungan CSRF');
const A = { 'x-requested-with': NILAI_CSRF, host: 'sewa.example.com' };
cek('GET tanpa header tetap lolos', jalankan(perlindunganCsrf, { method: 'GET' }).lolos);
r = jalankan(perlindunganCsrf, { method: 'POST', headers: { host: 'sewa.example.com' } });
cek('POST tanpa header khusus ditolak 403', !r.lolos && r.status === 403 && /verifikasi keamanan/.test(r.body.pesan));
cek('POST dengan header salah ditolak', !jalankan(perlindunganCsrf, { method: 'POST', headers: { ...A, 'x-requested-with': 'XMLHttpRequest' } }).lolos);
cek('POST dengan header benar & tanpa Origin lolos (mis. skrip tes)', jalankan(perlindunganCsrf, { method: 'POST', headers: A }).lolos);
cek('POST dengan Origin sama lolos', jalankan(perlindunganCsrf, { method: 'POST', headers: { ...A, origin: 'https://sewa.example.com' } }).lolos);
cek('POST dengan Origin situs lain ditolak', !jalankan(perlindunganCsrf, { method: 'POST', headers: { ...A, origin: 'https://jahat.example.net' } }).lolos);
cek('Origin "null" ditolak', !jalankan(perlindunganCsrf, { method: 'POST', headers: { ...A, origin: 'null' } }).lolos);
cek('Sec-Fetch-Site cross-site ditolak', !jalankan(perlindunganCsrf, { method: 'POST', headers: { ...A, 'sec-fetch-site': 'cross-site' } }).lolos);
cek('Sec-Fetch-Site same-site (subdomain lain) ditolak', !jalankan(perlindunganCsrf, { method: 'POST', headers: { ...A, 'sec-fetch-site': 'same-site' } }).lolos);
cek('Sec-Fetch-Site same-origin lolos', jalankan(perlindunganCsrf, { method: 'POST', headers: { ...A, 'sec-fetch-site': 'same-origin' } }).lolos);
for (const m of ['PATCH', 'PUT', 'DELETE']) cek(`${m} tanpa header khusus ditolak`, !jalankan(perlindunganCsrf, { method: m, headers: { host: 'x' } }).lolos);

console.log(`\nHasil: ${ok} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
