// Tes integrasi: jalankan setelah `npm run db:init`. Memakai basis data sungguhan (data uji ditambahkan ke tabel).
require('dotenv').config();
const app = require('./server');
const { pool } = require('./db');
let ok = 0, gagal = 0, token = '', base = '';
const cek = (nama, kondisi, info = '') => { kondisi ? ok++ : gagal++; console.log((kondisi ? '  ✓ ' : '  ✗ ') + nama + (kondisi ? '' : '  -> ' + info)); };
async function api(method, url, body, tok = token) {
  const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'HabibieRentCar', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, d: await r.json().catch(() => ({})) };
}
const hariIni = new Date(); const tgl = (n, j = '08:00') => { const d = new Date(Date.now() + n * 864e5 + 7 * 36e5); return d.toISOString().slice(0, 10) + 'T' + j; };

(async () => {
  const srv = app.listen(0); base = 'http://localhost:' + srv.address().port;
  await pool.query('DELETE FROM jejak_audit'); await pool.query('DELETE FROM pembayaran'); await pool.query('DELETE FROM pemesanan'); await pool.query('DELETE FROM servis'); await pool.query('DELETE FROM kode_urut');
  await pool.query("DELETE FROM unit WHERE nama LIKE 'Unit Uji %'"); await pool.query("DELETE FROM pengguna WHERE username = 'uji_nonaktif'");   // sisa uji sebelumnya yang terhenti
  console.log('Autentikasi');
  let r = await api('GET', '/api/unit', null, ''); cek('tanpa login ditolak (NF-02)', r.s === 401);
  r = await api('POST', '/api/auth/login', { username: 'dimas', password: 'salah' }, ''); cek('kata sandi salah -> 401', r.s === 401);
  for (let i = 0; i < 4; i++) r = await api('POST', '/api/auth/login', { username: 'dimas', password: 'salah' }, '');
  cek('gagal ke-5 -> akun terkunci (KF-24)', r.s === 423, JSON.stringify(r));
  r = await api('POST', '/api/auth/login', { username: 'dimas', password: 'dimas123' }, ''); cek('login benar saat terkunci tetap ditolak', r.s === 423);
  await pool.query('UPDATE pengguna SET terkunci_sampai = NULL, gagal_login = 0');
  r = await api('POST', '/api/auth/login', { username: 'dimas', password: 'dimas123' }, ''); cek('login dimas berhasil', r.s === 200 && r.d.token); const tokDimas = r.d.token;
  r = await api('POST', '/api/auth/login', { username: 'admin', password: 'admin123' }, ''); token = r.d.token; cek('login admin berhasil', !!token);

  console.log('Unit & ketersediaan');
  r = await api('GET', '/api/unit'); cek('19 unit aktif', r.d.length === 19); const U = Object.fromEntries(r.d.map((u) => [u.nama, u]));
  cek('Hiace dengan driver', U['Hiace'].dengan_driver === 1 && U['Hiace'].tarif_harian === 1300000);
  r = await api('GET', `/api/ketersediaan?mulai=${tgl(5)}&selesai=${tgl(7)}&transmisi=Matic`); cek('filter transmisi Matic', r.d.length > 0 && r.d.every((u) => u.transmisi === 'Matic' && u.tersedia));
  r = await api('GET', `/api/ketersediaan?mulai=${tgl(5, '08:15')}&selesai=${tgl(7)}`); cek('waktu bukan kelipatan 30 menit ditolak (NF-05)', r.s === 400);

  console.log('Pemesanan, bentrok, kode');
  const buat = (o = {}) => api('POST', '/api/pemesanan', { nama_pelanggan: 'Budi', no_wa: '081234567890', bbm_ambil: 6, unit_id: U['Avanza Hitam'].id, mulai: tgl(10), selesai: tgl(12), ...o });
  r = await buat({ kondisi_ambil: 'Lecet kecil di pintu kiri' }); cek('booking dibuat, status Menunggu DP, total 2 hari x 250.000', r.s === 201 && r.d.status === 'Menunggu DP' && r.d.total_sewa === 500000, JSON.stringify(r.d)); const b1 = r.d;
  cek('kondisi unit saat diambil tersimpan sejak booking', b1.kondisi_ambil === 'Lecet kecil di pintu kiri', JSON.stringify(b1.kondisi_ambil));
  cek('kode format BK-AAMMDD-NNN (KF-23)', /^BK-\d{6}-001$/.test(b1.kode), b1.kode);
  r = await buat({ mulai: tgl(11), selesai: tgl(13), nama_pelanggan: 'Sari' }); cek('bentrok ditolak 409 menyebut kode & penginput (KF-06)', r.s === 409 && r.d.pesan.includes(b1.kode) && r.d.pesan.includes('Admin'), JSON.stringify(r.d));
  r = await buat({ mulai: tgl(12, '08:30'), selesai: tgl(13) }); cek('jeda kurang dari 1 jam ditolak (AB-01)', r.s === 409);
  r = await buat({ mulai: tgl(12, '09:00'), selesai: tgl(13) }); cek('jeda tepat 1 jam diterima', r.s === 201, JSON.stringify(r.d));
  r = await buat({ no_wa: '123' }); cek('nomor WhatsApp tidak valid ditolak', r.s === 400);
  r = await buat({ bbm_ambil: undefined, unit_id: U['Agya'].id }); cek('BBM saat diambil wajib diisi saat booking', r.s === 400);
  r = await buat({ bbm_ambil: 9, unit_id: U['Agya'].id }); cek('BBM di luar 0–8 ditolak (AB-14)', r.s === 400);
  r = await buat({ unit_id: U['Hiace'].id, mulai: tgl(20), selesai: tgl(21) }); cek('Hiace otomatis dengan driver (AB-11)', r.s === 201 && r.d.dengan_driver === 1 && r.d.total_sewa === 1300000);
  r = await buat({ unit_id: U['Agya'].id, mulai: tgl(30), selesai: tgl(31), uang_muka: 150000, sumber: 'Telepon', jenis_sewa: 'Kontrak' }); cek('uang muka saat buat -> Dibooking, sumber & jenis tersimpan', r.s === 201 && r.d.status === 'Dibooking' && r.d.sumber === 'Telepon' && r.d.jenis_sewa === 'Kontrak' && r.d.dibayar === 150000, JSON.stringify(r.d));
  r = await buat({ unit_id: U['Agya'].id, mulai: tgl(40), selesai: tgl(41), uang_muka: 999999 }); cek('uang muka melebihi total ditolak', r.s === 400);

  console.log('Konkurensi (NF-03)');
  const [x, y] = await Promise.all([buat({ unit_id: U['Rush'].id, mulai: tgl(50), selesai: tgl(52), nama_pelanggan: 'A' }), api('POST', '/api/pemesanan', { nama_pelanggan: 'B', no_wa: '081234567891', bbm_ambil: 4, unit_id: U['Rush'].id, mulai: tgl(51), selesai: tgl(53) }, tokDimas)]);
  cek('dua pencatatan bersamaan: tepat satu berhasil', [x.s, y.s].sort().join() === '201,409', x.s + ',' + y.s);

  console.log('Rekanan (AB-12, KF-11)');
  r = await api('POST', '/api/pemesanan', { nama_pelanggan: 'Nada', no_wa: '081276550966', bbm_ambil: 4, mulai: tgl(10), selesai: tgl(12), rekanan: { nama: 'Zira', unit: 'Pajero', biaya: 250000, harga: 300000 } });
  cek('booking rekanan tanpa cek bentrok, selisih 50.000', r.s === 201 && r.d.selisih_rekanan === 50000 && r.d.unit_id === null, JSON.stringify(r.d));
  const [[{ n: nSewa }]] = await pool.query("SELECT COUNT(*) n FROM unit"); cek('unit milik usaha tidak berubah', nSewa === 19);

  r = await buat({ unit_id: U['Terios Manual'].id, mulai: tgl(10), selesai: tgl(12), nama_pelanggan: 'Alur' }); const bf = r.d;
  r = await buat({ unit_id: U['Terios Manual'].id, mulai: tgl(15, '09:00'), selesai: tgl(16), nama_pelanggan: 'Tetangga' });
  console.log('Pembayaran & status');
  r = await api('POST', `/api/pemesanan/${bf.id}/pembayaran`, { jenis: 'DP', nominal: 300000 }); cek('catat DP -> Dibooking (KF-07)', r.s === 201 && r.d.status === 'Dibooking' && r.d.sisa === 300000, JSON.stringify(r.d));
  r = await api('POST', `/api/pemesanan/${bf.id}/pembayaran`, { jenis: 'Pelunasan', nominal: 999999 }); cek('nominal melebihi sisa ditolak', r.s === 400);
  r = await api('POST', `/api/pemesanan/${bf.id}/pembayaran`, { jenis: 'Pelunasan', nominal: 300000 }); cek('pelunasan -> sisa 0', r.d.sisa === 0);

  console.log('Ubah & perpanjang (KF-13)');
  r = await api('PATCH', `/api/pemesanan/${bf.id}`, { selesai: tgl(14) }); cek('ubah periode, total dihitung ulang', r.s === 200 && r.d.total_sewa === 1200000 && r.d.diubah_oleh_nama === 'Admin', JSON.stringify(r.d));
  r = await api('PATCH', `/api/pemesanan/${bf.id}`, { selesai: tgl(14), mulai: tgl(10, '08:00') }); cek('tanpa perubahan -> tetap 200', r.s === 200);
  r = await api('PATCH', `/api/pemesanan/${bf.id}`, { selesai: tgl(16) }); cek('ubah yang bentrok dengan pemesanan lain ditolak (periksa ulang)', r.s === 409, JSON.stringify(r.d).slice(0, 120));

  console.log('Pengambilan & pembatalan');
  r = await api('POST', `/api/pemesanan/${bf.id}/pengambilan`, { kondisi_ambil: 'Lecet kecil di pintu kiri' }); cek('pengambilan tanpa jaminan ditolak (KF-15)', r.s === 400);
  r = await api('POST', `/api/pemesanan/${bf.id}/pengambilan`, { jaminan: 'KTP', kondisi_ambil: 'Lecet kecil di pintu kiri' }); cek('pengambilan -> Disewa; BBM diambil dari data booking (KF-20)', r.s === 200 && r.d.status === 'Disewa' && r.d.jaminan === 'KTP' && r.d.bbm_ambil === 6, JSON.stringify(r.d));
  r = await api('POST', `/api/pemesanan/${bf.id}/batal`); cek('Disewa tidak dapat dibatalkan (AB-15)', r.s === 409);
  r = await api('PATCH', `/api/pemesanan/${bf.id}`, { selesai: tgl(15) }); cek('perpanjang saat Disewa -> total 5 hari, tercatat "diperpanjang"', r.s === 200 && r.d.total_sewa === 1500000, JSON.stringify(r.d).slice(0, 150));
  r = await api('PATCH', `/api/pemesanan/${bf.id}`, { mulai: tgl(9) }); cek('waktu ambil tidak bisa diubah saat Disewa', r.s === 409);
  r = await api('POST', `/api/pemesanan/${bf.id}/pengembalian`, { bbm_kembali: 4, kondisi_kembali: 'Baret bumper', denda: 125000, biaya_bbm: 50000, ganti_rugi: 200000, pembayaran: 1000000 }); cek('waktu kembali aktual wajib diisi', r.s === 400 && r.d.pesan.includes('wajib diisi'));
  r = await api('POST', `/api/pemesanan/${bf.id}/pengembalian`, { waktu_kembali: tgl(15, '08:17'), bbm_kembali: 4, kondisi_kembali: 'Baret bumper', denda: 125000, biaya_bbm: 50000, ganti_rugi: 200000, pembayaran: 1000000 });
  cek('pengembalian: nominal manual disimpan, status Selesai (KF-21)', r.s === 200 && r.d.status === 'Selesai' && r.d.denda === 125000 && r.d.biaya_bbm === 50000 && r.d.ganti_rugi === 200000, JSON.stringify(r.d).slice(0, 200));
  cek('tagihan = sewa + denda + BBM + ganti rugi; sisa benar', r.d.tagihan === 1875000 && r.d.dibayar === 1600000 && r.d.sisa === 275000, JSON.stringify({ t: r.d.tagihan, d: r.d.dibayar, s: r.d.sisa }));
  r = await api('POST', `/api/pemesanan/${bf.id}/batal`); cek('Selesai tidak dapat dibatalkan', r.s === 409);
  r = await buat({ unit_id: U['Terios Manual'].id, mulai: tgl(10), selesai: tgl(11), nama_pelanggan: 'Setelah selesai' }); cek('unit bebas lagi setelah Selesai (AB-02)', r.s === 201, JSON.stringify(r.d));
  const [[bTunggu]] = [[(await api('GET', '/api/pemesanan?status=Menunggu%20DP')).d[0]]];
  r = await api('POST', `/api/pemesanan/${bTunggu.id}/batal`); cek('batal sebelum DP: Dibatalkan, tanpa biaya (AB-10)', r.s === 200 && r.d.status === 'Dibatalkan' && r.d.dp_hangus === 0);
  const [bDp] = (await api('GET', '/api/pemesanan?status=Dibooking')).d;
  r = await api('POST', `/api/pemesanan/${bDp.id}/batal`); cek('batal setelah DP: uang muka hangus (AB-09)', r.s === 200 && r.d.dp_hangus === 150000, JSON.stringify(r.d).slice(0, 100));
  r = await buat({ unit_id: bDp.unit_id, mulai: bDp.mulai.slice(0, 16).replace(' ', 'T'), selesai: bDp.selesai.slice(0, 16).replace(' ', 'T') }); cek('unit bebas setelah dibatalkan (AB-02)', r.s === 201);

  console.log('Servis (KF-19)');
  r = await api('POST', '/api/servis', { unit_id: U['Brio Matic'].id, mulai: tgl(60), selesai: tgl(62), alasan: 'Ganti oli' }); cek('servis dicatat', r.s === 201); const sv = r.d;
  r = await api('POST', '/api/servis', { unit_id: U['Avanza Hitam'].id, mulai: tgl(9), selesai: tgl(10, '07:30'), alasan: 'Pengecekan' }); cek('servis tidak diblokir jeda 1 jam booking yang tidak tumpang tindih', r.s === 201, JSON.stringify(r.d)); if (r.s === 201) await api('DELETE', `/api/servis/${r.d.id}`);
  r = await api('POST', '/api/pemesanan', { nama_pelanggan: 'X', no_wa: '081234567890', bbm_ambil: 4, unit_id: U['Brio Matic'].id, mulai: tgl(61), selesai: tgl(63) }); cek('booking pada periode servis ditolak', r.s === 409 && r.d.pesan.includes('servis'), JSON.stringify(r.d));
  r = await api('POST', '/api/servis', { unit_id: U['Avanza Hitam'].id, mulai: tgl(10), selesai: tgl(11) }); cek('servis menimpa pemesanan ditolak', r.s === 409);
  r = await api('GET', `/api/ketersediaan?mulai=${tgl(60)}&selesai=${tgl(61)}`); cek('ketersediaan menyebut alasan Servis (KF-04)', r.d.find((u) => u.nama === 'Brio Matic').alasan.jenis === 'Servis');
  r = await api('DELETE', `/api/servis/${sv.id}`); cek('servis dihapus', r.s === 200);

  console.log('Jadwal, laporan, audit');
  r = await api('GET', `/api/jadwal?dari=${tgl(0).slice(0, 10)}&sampai=${tgl(70).slice(0, 10)}`); cek('jadwal memuat pemesanan', r.d.pemesanan.length > 3);
  const d = new Date(Date.now() + 10 * 864e5);
  r = await api('GET', `/api/laporan?tahun=${d.getFullYear()}`); cek('laporan tahunan: ringkasan & rekap', r.s === 200 && r.d.ringkasan.jumlah_pemesanan > 0 && r.d.per_unit.length > 0 && r.d.daftar.length > 0, JSON.stringify(r.d.ringkasan));
  r = await api('GET', `/api/pemesanan/${bf.id}`); const ak = r.d.jejak_audit.map((a) => a.aksi); cek('jejak audit mencatat siapa & kapan (NF-06)', ['dibuat', 'pembayaran', 'diubah', 'diperpanjang', 'pengambilan', 'pengembalian'].every((x) => ak.includes(x)) && r.d.jejak_audit.every((a) => a.nama_pengguna && a.waktu), JSON.stringify(ak));

  console.log('Kelola unit (tambah, ubah, nonaktifkan)');
  r = await api('POST', '/api/unit', { nama: 'Unit Uji A', plat: 'bm 7777 uj', transmisi: 'Matic', tarif_harian: 300000, dengan_driver: false });
  cek('tambah unit -> 201, plat dirapikan jadi huruf besar', r.s === 201 && r.d.id && r.d.plat === 'BM 7777 UJ' && r.d.aktif === 1, JSON.stringify(r));
  const uA = r.d.id;
  r = await api('POST', '/api/unit', { nama: 'Unit Uji A', transmisi: 'Manual', tarif_harian: 250000 }); cek('nama kembar ditolak 409', r.s === 409, JSON.stringify(r));
  r = await api('POST', '/api/unit', { nama: 'Unit Uji B', plat: 'BM 7777 UJ', transmisi: 'Manual', tarif_harian: 250000 }); cek('plat kembar ditolak 409 dan menyebut unit pemilik plat', r.s === 409 && /Unit Uji A/.test(r.d.pesan), JSON.stringify(r));
  r = await api('POST', '/api/unit', { nama: 'Unit Uji C', transmisi: 'Otomatis', tarif_harian: 250000 }); cek('transmisi di luar Manual/Matic ditolak 400', r.s === 400);
  r = await api('POST', '/api/unit', { nama: 'Unit Uji C', transmisi: 'Manual', tarif_harian: 0 }); cek('tarif 0 ditolak 400', r.s === 400);
  r = await api('POST', '/api/unit', { nama: 'Unit Uji C', transmisi: 'Manual', tarif_harian: 250000.5 }); cek('tarif pecahan ditolak 400', r.s === 400);
  r = await api('POST', '/api/unit', { nama: 'Unit Uji C', transmisi: 'Manual', tarif_harian: 99999999 }); cek('tarif di atas batas wajar ditolak 400', r.s === 400);
  r = await api('POST', '/api/unit', { nama: '  ', transmisi: 'Manual', tarif_harian: 250000 }); cek('nama kosong ditolak 400', r.s === 400);
  r = await api('POST', '/api/unit', { nama: 'Unit Uji C', plat: '!', transmisi: 'Manual', tarif_harian: 250000 }); cek('plat tidak valid ditolak 400', r.s === 400);
  r = await api('POST', '/api/unit', { nama: 'Unit Uji C', transmisi: 'Manual', tarif_harian: 250000 }, ''); cek('tambah unit tanpa login ditolak 401', r.s === 401);
  r = await api('GET', '/api/unit'); cek('unit baru ada di daftar aktif (20 unit) berstatus Tersedia', r.d.length === 20 && r.d.some((u) => u.id === uA && u.status_sekarang === 'Tersedia'));

  r = await api('POST', '/api/pemesanan', { nama_pelanggan: 'Uji Unit', no_wa: '081200000001', unit_id: uA, bbm_ambil: 8, mulai: tgl(40), selesai: tgl(42) });
  cek('booking di unit baru: total = tarif x hari (2 x 300.000)', r.s === 201 && r.d.total_sewa === 600000, JSON.stringify(r.d));
  const bU = r.d.id, kU = r.d.kode;
  r = await api('PATCH', `/api/unit/${uA}`, { aktif: false }); cek('unit yang masih punya booking tidak bisa dinonaktifkan (409, menyebut kode booking)', r.s === 409 && r.d.pesan.includes(kU), JSON.stringify(r));
  r = await api('PATCH', `/api/unit/${uA}`, { nama: 'Unit Uji A2', tarif_harian: 500000 }); cek('ubah nama & tarif -> 200', r.s === 200 && r.d.nama === 'Unit Uji A2' && r.d.tarif_harian === 500000, JSON.stringify(r));
  r = await api('PATCH', `/api/unit/${uA}`, { nama: 'Hiace' }); cek('mengubah nama menjadi nama unit lain ditolak 409', r.s === 409);
  r = await api('GET', `/api/pemesanan/${bU}`); cek('ubah tarif unit tidak mengubah total booking yang sudah ada', r.d.total_sewa === 600000, JSON.stringify(r.d.total_sewa));
  r = await api('PATCH', `/api/pemesanan/${bU}`, { catatan: 'hanya ubah catatan' }); cek('mengedit catatan booking lama tidak menghitung ulang dengan tarif baru', r.s === 200 && r.d.total_sewa === 600000, JSON.stringify(r.d.total_sewa));
  r = await api('PATCH', `/api/pemesanan/${bU}`, { selesai: tgl(43) }); cek('perpanjang 1 hari memakai tarif lama: 3 x 300.000, bukan tarif baru', r.s === 200 && r.d.total_sewa === 900000, JSON.stringify(r.d.total_sewa));
  r = await api('POST', '/api/pemesanan', { nama_pelanggan: 'Uji Unit 2', no_wa: '081200000002', unit_id: uA, bbm_ambil: 8, mulai: tgl(50), selesai: tgl(51) });
  cek('booking baru memakai tarif baru (1 x 500.000)', r.s === 201 && r.d.total_sewa === 500000, JSON.stringify(r.d));
  const bU2 = r.d.id;
  r = await api('POST', '/api/servis', { unit_id: uA, mulai: tgl(60), selesai: tgl(61), alasan: 'uji' }); const svU = r.d.id;
  await api('POST', `/api/pemesanan/${bU}/batal`); await api('POST', `/api/pemesanan/${bU2}/batal`);
  r = await api('PATCH', `/api/unit/${uA}`, { aktif: false }); cek('jadwal servis mendatang juga menahan penonaktifan (409)', r.s === 409 && /servis/i.test(r.d.pesan), JSON.stringify(r));
  await api('DELETE', `/api/servis/${svU}`);
  r = await api('PATCH', `/api/unit/${uA}`, { aktif: false }); cek('setelah booking dibatalkan & servis dihapus, unit bisa dinonaktifkan', r.s === 200 && r.d.aktif === 0, JSON.stringify(r));
  r = await api('GET', '/api/unit'); cek('unit nonaktif tidak ada di daftar aktif (kembali 19)', r.d.length === 19 && !r.d.some((u) => u.id === uA));
  r = await api('GET', '/api/unit?semua=1'); cek('?semua=1 menyertakan unit nonaktif', r.d.length === 20 && r.d.some((u) => u.id === uA && u.aktif === 0));
  r = await api('POST', '/api/pemesanan', { nama_pelanggan: 'Uji Unit 3', no_wa: '081200000003', unit_id: uA, bbm_ambil: 8, mulai: tgl(70), selesai: tgl(71) }); cek('unit nonaktif tidak bisa dibooking', r.s === 404, JSON.stringify(r));
  r = await api('GET', `/api/ketersediaan?mulai=${tgl(70)}&selesai=${tgl(71)}`); cek('unit nonaktif tidak muncul di ketersediaan', r.s === 200 && !r.d.some((u) => u.id === uA));
  r = await api('PATCH', `/api/unit/${uA}`, { aktif: true }); cek('unit nonaktif bisa diaktifkan kembali', r.s === 200 && r.d.aktif === 1);
  r = await api('PATCH', `/api/unit/${uA}`, { plat: '' }); cek('plat bisa dikosongkan', r.s === 200 && r.d.plat === null, JSON.stringify(r));
  r = await api('PATCH', '/api/unit/999999', { nama: 'x' }); cek('unit tidak ada -> 404', r.s === 404);
  const [aud] = await pool.query("SELECT aksi, nama_pengguna FROM jejak_audit WHERE entitas = 'unit' AND entitas_id = ?", [uA]); const aksiU = aud.map((a) => a.aksi);
  cek('jejak audit unit: dibuat, diubah, dinonaktifkan, diaktifkan (dengan nama staf)', ['dibuat', 'diubah', 'dinonaktifkan', 'diaktifkan'].every((x) => aksiU.includes(x)) && aud.every((a) => a.nama_pengguna === 'Admin'), JSON.stringify(aud));

  console.log('Keamanan');
  const http = require('http'), bcrypt = require('bcryptjs');
  const mentah = (method, url, headers, body) => new Promise((resolve, reject) => {     // permintaan mentah: header diatur sepenuhnya oleh tes
    const rq = http.request(base + url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...headers } }, (rs) => {
      let t = ''; rs.on('data', (c) => (t += c)); rs.on('end', () => resolve({ s: rs.statusCode, h: rs.headers, d: t }));
    });
    rq.on('error', reject); if (body) rq.write(JSON.stringify(body)); rq.end();
  });
  const unitX = { nama: 'Unit Uji X', transmisi: 'Manual', tarif_harian: 100000 };
  r = await mentah('POST', '/api/unit', {}, unitX); cek('POST tanpa header CSRF ditolak 403', r.s === 403, r.d);
  r = await mentah('POST', '/api/unit', { 'X-Requested-With': 'HabibieRentCar', Origin: 'https://jahat.example.net' }, unitX); cek('POST dari Origin situs lain ditolak 403', r.s === 403, r.d);
  r = await mentah('POST', '/api/unit', { 'X-Requested-With': 'HabibieRentCar', 'Sec-Fetch-Site': 'cross-site' }, unitX); cek('POST bertanda cross-site ditolak 403', r.s === 403, r.d);
  r = await mentah('PATCH', `/api/unit/${uA}`, {}, { nama: 'Diretas' }); cek('PATCH tanpa header CSRF ditolak 403', r.s === 403);
  r = await mentah('DELETE', '/api/servis/1', {}); cek('DELETE tanpa header CSRF ditolak 403', r.s === 403);
  r = await mentah('POST', '/api/auth/login', {}, { username: 'admin', password: 'admin123' }); cek('login pun wajib membawa header CSRF', r.s === 403);
  const [[{ n: nX }]] = await pool.query("SELECT COUNT(*) n FROM unit WHERE nama IN ('Unit Uji X', 'Diretas')"); cek('permintaan yang ditolak tidak mengubah data', nX === 0);
  r = await mentah('GET', '/api/unit', {}); cek('GET tanpa header CSRF tetap diizinkan', r.s === 200);
  r = await mentah('POST', '/api/unit', { 'X-Requested-With': 'HabibieRentCar', Origin: base }, { nama: 'Unit Uji X', transmisi: 'Manual', tarif_harian: 100000 }); cek('POST dari Origin yang sama + header benar diterima', r.s === 201, r.d);
  r = await mentah('GET', '/api/unit', {}); cek('respons API: nosniff, anti-iframe, no-store, tanpa X-Powered-By', r.h['x-content-type-options'] === 'nosniff' && r.h['x-frame-options'] === 'DENY' && r.h['cache-control'] === 'no-store' && !r.h['x-powered-by'], JSON.stringify(r.h));
  r = await mentah('GET', '/', {}); cek('halaman utama membawa CSP yang melarang skrip inline/pihak luar', /script-src 'self'/.test(r.h['content-security-policy'] || '') && /frame-ancestors 'none'/.test(r.h['content-security-policy'] || '') && r.s === 200, r.s);
  await pool.query('INSERT INTO pengguna (username, nama, password_hash) VALUES (?,?,?)', ['uji_nonaktif', 'Uji Nonaktif', bcrypt.hashSync('sandiUji123', 8)]);
  r = await api('POST', '/api/auth/login', { username: 'uji_nonaktif', password: 'sandiUji123' }, ''); const tokUji = r.d.token;
  r = await api('GET', '/api/unit', null, tokUji); cek('akun aktif dapat mengakses', r.s === 200);
  await pool.query("UPDATE pengguna SET aktif = 0 WHERE username = 'uji_nonaktif'");
  r = await api('GET', '/api/unit', null, tokUji); cek('akun yang dinonaktifkan langsung ditolak walau tokennya belum kedaluwarsa', r.s === 401, JSON.stringify(r));

  // bersihkan data uji unit agar jumlah unit kembali 19
  await pool.query('DELETE FROM pengguna WHERE username = ?', ['uji_nonaktif']);
  const [ids] = await pool.query("SELECT id FROM unit WHERE nama LIKE 'Unit Uji %' OR nama = 'Diretas'");
  for (const { id } of ids) {
    await pool.query('DELETE FROM pembayaran WHERE pemesanan_id IN (SELECT id FROM pemesanan WHERE unit_id = ?)', [id]);
    await pool.query('DELETE FROM pemesanan WHERE unit_id = ?', [id]); await pool.query('DELETE FROM servis WHERE unit_id = ?', [id]); await pool.query('DELETE FROM unit WHERE id = ?', [id]);
  }
  r = await api('GET', '/api/unit'); cek('data uji unit dibersihkan (kembali 19 unit)', r.d.length === 19, r.d.length);

  console.log(`\nHasil: ${ok} lulus, ${gagal} gagal`);
  srv.close(); await pool.end(); process.exit(gagal ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
