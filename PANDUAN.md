# Panduan Menjalankan Sistem Habibie Rent Car (Windows)

## A. Persiapan (sekali saja)
1. **Node.js**: unduh versi LTS dari https://nodejs.org lalu pasang (Next terus). Cek di PowerShell: `node -v` (harus muncul angka versi, misalnya v20 atau v22).
2. **MySQL**: pasang XAMPP dari https://www.apachefriends.org, buka *XAMPP Control Panel*, klik **Start** pada baris **MySQL** sampai hijau. (Apache tidak perlu dinyalakan.)
3. **Berkas sistem**: ekstrak `habibie-rent-car-backend.zip` ke `C:\habibie-rent-car`. Hindari folder OneDrive karena `node_modules` berukuran besar dan sering gagal sinkron.

## B. Pasang dan siapkan basis data
Buka PowerShell, lalu jalankan satu per satu:
```
cd C:\habibie-rent-car\backend
npm install
copy .env.example .env
notepad .env
```
Di Notepad ubah isi `.env` seperti ini, lalu simpan:
```
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=habibie_rent_car
JWT_SECRET=
```
(`DB_PASSWORD` dikosongkan karena XAMPP awalnya tanpa kata sandi.) **`JWT_SECRET` wajib diisi.** Jalankan perintah ini di PowerShell, salin teks acak yang muncul, lalu tempel setelah tanda `=` di `.env` dan simpan:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Tanpa `JWT_SECRET` yang valid, server menolak menyala dan menampilkan pesan yang menjelaskan caranya. Lanjutkan:
```
npm run db:init
```
Hasil yang benar: `19 unit dimasukkan.` dan `Basis data siap: habibie_rent_car`.

## C. Uji sebelum dipakai (disarankan)
```
npm test
npm run db:bersih
```
Hasil yang benar: `Hasil: 96 lulus, 0 gagal`. Perintah kedua menghapus data uji. **Peringatan:** `npm test` menghapus semua data pemesanan yang ada, jadi jangan dijalankan setelah sistem dipakai sungguhan. Untuk memeriksa modul keamanan tanpa menyentuh data, pakai `npm run test:keamanan` (aman kapan saja).

## D. Ganti kata sandi akun awal
```
npm run sandi -- admin KataSandiBaruAdmin1
npm run sandi -- dimas KataSandiBaruDimas1
```
(minimal 8 karakter). Akun awal `admin` / `admin123` dan `dimas` / `dimas123` jangan dipakai terus.

## E. Jalankan sistem
```
npm start
```
Biarkan jendela PowerShell terbuka. Buka browser ke **http://localhost:3000**, lalu masuk.

## F. Cek alur lengkap (sekitar 10 menit)
1. **Ketersediaan**: pilih tanggal, klik Cek, lalu Buat booking pada unit yang bebas.
2. **Booking baru**: isi nama, WhatsApp, BBM saat diambil, dan jaminan, lalu simpan. Status awal Menunggu DP.
3. **Detail**: catat DP, status menjadi Dibooking. Coba buat booking lain di unit dan waktu yang sama, harus ditolak (bentrok).
4. **Mulai sewa**: status menjadi Disewa. Tombol Batalkan hilang. Coba **Perpanjang sewa**.
5. **Pengembalian**: isi BBM saat kembali, kondisi, serta denda, biaya BBM, dan ganti rugi secara manual, lalu selesaikan.
6. **Laporan**: pilih bulan dan tahun, coba Cetak per bagian dan Unduh CSV.
7. **Servis unit**: buat jadwal servis, lalu cek di Ketersediaan unit itu tidak tersedia.
8. **Kelola unit**: di halaman Ketersediaan klik **+ Tambah unit**, isi nama, transmisi, tarif, lalu simpan; kartu unit baru muncul. Klik **Edit** untuk mengubah data, atau **Nonaktifkan** untuk menyembunyikan unit (unit yang masih punya booking aktif akan ditolak). Unit nonaktif ada di daftar "Unit nonaktif" di bagian bawah halaman dan bisa diaktifkan kembali.

## G. Dipakai oleh beberapa orang
- Satu komputer menjalankan `npm start`. Cari alamat IP-nya dengan `ipconfig` (baris IPv4, misalnya 192.168.1.10).
- Perangkat lain di Wi-Fi yang sama membuka `http://192.168.1.10:3000`. Bila tidak bisa, izinkan Node.js lewat Windows Firewall.
- Untuk dipakai dari luar kantor, sistem perlu di-hosting ke server (VPS) dengan HTTPS. Minta bantuan ini bila sudah saatnya.

## H. Cadangan data
Buka http://localhost/phpmyadmin, pilih basis data `habibie_rent_car`, lalu **Ekspor**. Lakukan rutin, misalnya tiap minggu.

## I. Bila ada masalah
| Gejala | Penyebab dan solusi |
|---|---|
| `ECONNREFUSED 127.0.0.1:3306` | MySQL belum Start di XAMPP. |
| `Access denied for user` | `DB_USER` atau `DB_PASSWORD` di `.env` salah. |
| `EADDRINUSE` | Port 3000 dipakai program lain. Ganti `PORT` di `.env`. |
| Halaman kosong atau "Gagal memuat data" | `npm start` belum jalan atau berhenti. Jalankan ulang. |
| Akun terkunci | Tunggu 15 menit, atau `npm run sandi -- <username> <sandi baru>`. |
