-- Skema basis data Habibie Rent Car (MySQL 8 / MariaDB 10.5+)
CREATE TABLE IF NOT EXISTS pengguna (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  nama VARCHAR(100) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  gagal_login TINYINT NOT NULL DEFAULT 0,
  terkunci_sampai DATETIME NULL,
  aktif TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS unit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(100) NOT NULL,
  plat VARCHAR(20) NULL UNIQUE,
  transmisi ENUM('Manual','Matic') NOT NULL,
  tarif_harian INT NOT NULL,
  dengan_driver TINYINT(1) NOT NULL DEFAULT 0,
  aktif TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pemesanan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kode VARCHAR(20) NOT NULL UNIQUE,
  nama_pelanggan VARCHAR(100) NOT NULL,
  no_wa VARCHAR(20) NOT NULL,
  unit_id INT NULL,
  rekanan_nama VARCHAR(100) NULL,
  rekanan_unit VARCHAR(100) NULL,
  biaya_rekanan INT NULL,
  mulai DATETIME NOT NULL,
  selesai DATETIME NOT NULL,
  jenis_sewa ENUM('Harian','Kontrak') NOT NULL DEFAULT 'Harian',
  sumber ENUM('WhatsApp','Telepon','Datang langsung') NOT NULL DEFAULT 'WhatsApp',
  dengan_driver TINYINT(1) NOT NULL DEFAULT 0,
  catatan VARCHAR(255) NULL,
  total_sewa INT NOT NULL,
  status ENUM('Menunggu DP','Dibooking','Disewa','Selesai','Dibatalkan') NOT NULL,
  jaminan ENUM('KTP','Kendaraan bermotor') NULL,
  bbm_ambil TINYINT NULL,
  bbm_kembali TINYINT NULL,
  kondisi_ambil VARCHAR(255) NULL,
  kondisi_kembali VARCHAR(255) NULL,
  waktu_ambil DATETIME NULL,
  waktu_kembali DATETIME NULL,
  denda INT NOT NULL DEFAULT 0,
  biaya_bbm INT NOT NULL DEFAULT 0,
  ganti_rugi INT NOT NULL DEFAULT 0,
  dibuat_oleh INT NOT NULL,
  dibuat_pada DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  diubah_oleh INT NULL,
  diubah_pada DATETIME NULL,
  CONSTRAINT fk_pem_unit FOREIGN KEY (unit_id) REFERENCES unit(id),
  CONSTRAINT fk_pem_dibuat FOREIGN KEY (dibuat_oleh) REFERENCES pengguna(id),
  CONSTRAINT ck_pem_waktu CHECK (selesai > mulai),
  INDEX idx_pem_unit_waktu (unit_id, mulai, selesai),
  INDEX idx_pem_status (status)
);

CREATE TABLE IF NOT EXISTS pembayaran (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pemesanan_id INT NOT NULL,
  jenis ENUM('DP','Pelunasan') NOT NULL,
  nominal INT NOT NULL,
  dicatat_oleh INT NOT NULL,
  waktu DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pemesanan_id) REFERENCES pemesanan(id),
  FOREIGN KEY (dicatat_oleh) REFERENCES pengguna(id),
  CONSTRAINT ck_bayar CHECK (nominal > 0)
);

CREATE TABLE IF NOT EXISTS servis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  unit_id INT NOT NULL,
  mulai DATETIME NOT NULL,
  selesai DATETIME NOT NULL,
  alasan VARCHAR(255) NULL,
  dibuat_oleh INT NOT NULL,
  dibuat_pada DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_servis_unit FOREIGN KEY (unit_id) REFERENCES unit(id),
  FOREIGN KEY (dibuat_oleh) REFERENCES pengguna(id),
  CONSTRAINT ck_servis_waktu CHECK (selesai > mulai),
  INDEX idx_servis_unit (unit_id, mulai, selesai)
);

CREATE TABLE IF NOT EXISTS kode_urut (
  tanggal DATE PRIMARY KEY,
  n INT NOT NULL
);

CREATE TABLE IF NOT EXISTS jejak_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  waktu DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  pengguna_id INT NULL,
  nama_pengguna VARCHAR(100) NULL,
  entitas VARCHAR(30) NOT NULL,
  entitas_id INT NOT NULL,
  aksi VARCHAR(40) NOT NULL,
  detail TEXT NULL,
  INDEX idx_audit_entitas (entitas, entitas_id)
);
