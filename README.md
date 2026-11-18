# Backend – Sistem Informasi Internal Pengelolaan Booking dan Ketersediaan Unit pada Habibie Rent Car

Node.js + Express + MySQL. Mengacu pada Daftar Kebutuhan Sistem Revisi C3 (12 November 2026).

## Cara menjalankan
1. Pasang Node.js 18+ dan MySQL 8 (atau MariaDB 10.5+).
2. `npm install`
3. Salin `.env.example` menjadi `.env`, lalu isi `DB_USER`, `DB_PASSWORD`, dan `JWT_SECRET`. **`JWT_SECRET` wajib** diisi teks acak panjang; buat dengan `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Server menolak berjalan jika kosong, kurang dari 16 karakter, atau masih teks contoh.
4. `npm run db:init` membuat basis data, tabel, 19 unit awal, dan dua akun awal.
5. `npm start`, lalu buka http://localhost:3000/api/health.
6. `npm test` menjalankan 96 pemeriksaan (aturan bisnis, kelola unit, keamanan). Tes **menghapus semua data pemesanan, pembayaran, servis, dan jejak audit** lalu mengisinya dengan data uji, jadi jalankan hanya pada basis data yang belum dipakai sungguhan (lalu `npm run db:bersih`). `npm run test:keamanan` menjalankan 27 pemeriksaan modul keamanan tanpa basis data dan aman kapan saja.

Akun awal (ganti sebelum dipakai sungguhan): `admin` / `admin123` dan `dimas` / `dimas123`. Semua pengelola memiliki hak yang sama.

## Endpoint
Semua endpoint di bawah `/api` memerlukan header `Authorization: Bearer <token>` kecuali login dan health. Setiap permintaan POST, PATCH, dan DELETE (termasuk login) juga wajib membawa header `X-Requested-With: HabibieRentCar` (perlindungan CSRF); frontend mengirimnya otomatis.

| Metode dan jalur | Fungsi | Kebutuhan |
|---|---|---|
| POST `/auth/login`, POST `/auth/logout`, GET `/auth/saya` | Masuk, keluar, data pengguna. Akun terkunci 15 menit setelah 5 kali gagal | KF-01, KF-24, NF-02 |
| GET `/unit` | Unit aktif beserta status sekarang (Tersedia, Dibooking, Disewa, Servis). `?semua=1` ikut menyertakan unit nonaktif | KF-08 |
| POST `/unit` | Tambah unit: `nama`, `transmisi` (Manual atau Matic), `tarif_harian`, `plat` (opsional), `dengan_driver` | tambahan, permintaan klien |
| PATCH `/unit/:id` | Ubah data unit, atau nonaktifkan dan aktifkan kembali lewat `aktif`. Ditolak (409) bila unit masih punya pemesanan aktif atau servis mendatang | tambahan, permintaan klien |
| GET `/ketersediaan?mulai=&selesai=&transmisi=` | Unit tersedia pada periode, beserta alasan bila tidak tersedia | KF-04 |
| POST `/pemesanan` | Catat pemesanan (unit milik usaha atau `rekanan`); `bbm_ambil` (0–8) wajib diisi sejak booking | KF-05, KF-09, KF-11, KF-22, KF-23 |
| GET `/pemesanan?status=&unit_id=&dari=&sampai=&q=` | Daftar pemesanan | KF-12 |
| GET `/pemesanan/:id` | Detail, pembayaran, dan jejak audit | NF-06 |
| PATCH `/pemesanan/:id` | Ubah pemesanan, juga untuk perpanjang sewa (ubah `selesai` saat Disewa) | KF-13 |
| POST `/pemesanan/:id/pembayaran` | Catat DP atau pelunasan | KF-14 |
| POST `/pemesanan/:id/pengambilan` | Dibooking menjadi Disewa, simpan jaminan dan kondisi unit (BBM diambil dari data booking) | KF-15, KF-17, KF-18, KF-20 |
| POST `/pemesanan/:id/pengembalian` | Disewa menjadi Selesai, simpan nominal denda, biaya BBM, ganti rugi | KF-16, KF-21 |
| POST `/pemesanan/:id/batal` | Batalkan (hanya Menunggu DP dan Dibooking) | AB-09, AB-10, AB-15 |
| GET `/jadwal?dari=&sampai=&unit_id=` | Papan jadwal pemesanan dan servis | KF-12 |
| GET, POST `/servis`, DELETE `/servis/:id` | Jadwal servis yang memblokir unit | KF-19 |
| GET `/laporan?tahun=&bulan=` | Rekap pemasukan, per pelanggan, per unit, daftar pemesanan | tambahan, di luar C3 |

Format waktu: `YYYY-MM-DDTHH:mm`, kelipatan 30 menit, zona WIB. Status: Menunggu DP, Dibooking, Disewa, Selesai, Dibatalkan.

## Catatan rancangan
- **Bentrok dan konkurensi (NF-03):** setiap pencatatan berjalan dalam transaksi dan mengunci baris unit (`SELECT ... FOR UPDATE`), sehingga dua pengelola yang mencatat bersamaan pada unit yang sama diproses bergiliran. Pesan penolakan menyebut kode, penginput, dan waktu pencatatan pemesanan sebelumnya (KF-06).
- **Tidak ada perhitungan otomatis** untuk uang muka, denda, biaya bahan bakar, dan ganti rugi (AB-06); sistem hanya menyimpan nominal dari pengelola. Total sewa dihitung dari tarif harian dikali jumlah hari (dibulatkan ke atas per 24 jam).
- **Jejak audit (NF-06):** tabel `jejak_audit` menyimpan nama pengguna, waktu, aksi, dan perubahan untuk setiap pencatatan atau perubahan.
- **Jaminan** dapat diisi saat pemesanan dibuat atau saat pengambilan; pengambilan mewajibkan salah satunya terisi.
- **Kelola unit:** dari halaman Ketersediaan, tombol **+ Tambah unit** dan **Edit** pada tiap kartu. Unit tidak dihapus, hanya dinonaktifkan (daftar "Unit nonaktif" di bawah halaman, bisa diaktifkan lagi), sehingga riwayat pemesanan tetap utuh. Nama dan plat tidak boleh kembar. Perubahan dicatat di jejak audit.
- **Tarif unit dan booking lama:** mengubah tarif harian unit hanya berlaku untuk booking baru. Booking yang sudah ada tetap memakai tarif saat dibuat, termasuk ketika diedit atau diperpanjang; tarif unit yang sekarang hanya dipakai bila unit pada booking diganti.
- Hiace selalu dengan driver (AB-11). Data driver tidak disimpan.
- Kata sandi disimpan sebagai hash bcrypt. Token JWT (HS256) berlaku 8 jam.
- Folder `public/` berisi frontend (HTML, CSS, JS) yang disajikan oleh server yang sama, sehingga CORS tidak diperlukan. Buka http://localhost:3000 setelah `npm start`.
- `npm run sandi -- <username> <kata sandi baru>` mengganti kata sandi akun. `npm run db:bersih` mengosongkan data pemesanan (dipakai setelah `npm test`).

## Keamanan
- **Rahasia token:** `JWT_SECRET` wajib diisi dan tidak ada nilai bawaan (lihat langkah 3).
- **Perlindungan CSRF:** permintaan pengubah data harus membawa header `X-Requested-With: HabibieRentCar`, dan ditolak (403) jika `Origin` atau `Sec-Fetch-Site` menunjukkan asal dari situs lain.
- **Header keamanan** pada semua respons: Content-Security-Policy (skrip hanya dari server ini), anti-iframe, `nosniff`, `Referrer-Policy: no-referrer`; HSTS dikirim otomatis bila diakses lewat HTTPS. Respons `/api` tidak boleh di-cache. Kode ada di `src/keamanan.js`.
- **Akun dinonaktifkan** (`pengguna.aktif = 0`) langsung ditolak pada permintaan berikutnya, tanpa menunggu token kedaluwarsa.
- **Sudah ada sejak awal:** kata sandi bcrypt, wajib login untuk semua data, pesan gagal login yang seragam, kunci akun 15 menit setelah 5 kali gagal, dan nama pengelola pada setiap pencatatan diambil dari akun yang login.
- **Batasan yang perlu diketahui:** keluar (logout) hanya menghapus token di browser; belum ada pembatasan laju permintaan selain kunci akun; pakai HTTPS saat di-hosting (Railway menyediakannya).
