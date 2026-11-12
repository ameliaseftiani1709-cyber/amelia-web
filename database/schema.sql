-- =====================================================
-- LAB INVENTORY (TiDB) — SKEMA + DATA DEMO
-- Jalankan dengan "npm run db:init" atau salin ke
-- SQL Editor di TiDB Cloud. Aman dijalankan ulang.
-- =====================================================
CREATE DATABASE IF NOT EXISTS lab_inventory;
USE lab_inventory;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(30) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role ENUM('admin','staff') NOT NULL DEFAULT 'staff',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) AUTO_ID_CACHE=1;

CREATE TABLE IF NOT EXISTS items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kode VARCHAR(20) NOT NULL UNIQUE,
  nama VARCHAR(100) NOT NULL,
  kategori VARCHAR(50) NOT NULL,
  stok INT NOT NULL DEFAULT 0,
  tersedia INT NOT NULL DEFAULT 0,
  lokasi VARCHAR(60) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_items_kategori (kategori)
) AUTO_ID_CACHE=1;

CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kode VARCHAR(20) NULL UNIQUE,
  peminjam VARCHAR(100) NOT NULL,
  item_id INT NULL,
  item_kode VARCHAR(20) NOT NULL,
  item_nama VARCHAR(100) NOT NULL,
  jumlah INT NOT NULL,
  tanggal_pinjam DATE NOT NULL,
  tanggal_kembali DATE NULL,
  keterangan VARCHAR(200) NULL,
  status ENUM('dipinjam','selesai') NOT NULL DEFAULT 'dipinjam',
  dicatat_oleh INT NULL,
  dicatat_nama VARCHAR(100) NULL,
  diterima_oleh INT NULL,
  diterima_nama VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  returned_at TIMESTAMP NULL,
  INDEX idx_trx_status (status),
  INDEX idx_trx_created (created_at),
  INDEX idx_trx_item (item_id)
) AUTO_ID_CACHE=1;

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  actor_name VARCHAR(100) NULL,
  aksi VARCHAR(20) NOT NULL,
  detail VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_logs_created (created_at)
) AUTO_ID_CACHE=1;

-- ---------- AKUN DEMO ----------
-- admin / admin123  (Admin)
-- staff / staff123  (Staff)
INSERT IGNORE INTO users (id, username, password_hash, full_name, role, is_active) VALUES
(1, 'admin', 'scrypt$98abc476e55e6a36d07d5c1bddaee0f3$a85e815a4b2f21e52cb6ffbac26a38e2a3d597a922f8848a1618ba034b61c2af2c0a436d0f3fd94d25b5379c7e509b218a04197322fc1007cd36214cdedd93d8', 'Administrator Lab', 'admin', 1),
(2, 'staff', 'scrypt$c9e7582112752cec9cdc4d973d124811$1583f8111451b8166c216e2d589d4a37e939215ff4b988a28e917039561bb0b5580a1e935f2786cda3c38035a23a230b7930f82853b2d9d9c00ef8bbe7fdd683', 'Rina Lestari', 'staff', 1);

-- ---------- DATA BARANG ----------
INSERT IGNORE INTO items (id, kode, nama, kategori, stok, tersedia, lokasi) VALUES
(1,'BR001','Laptop Lenovo','Laptop',5,3,'Lemari A1'),
(2,'BR002','Mouse Logitech','Aksesoris',10,10,'Rak B1'),
(3,'BR003','Keyboard Mechanical','Aksesoris',8,8,'Rak B1'),
(4,'BR004','Proyektor Epson','Presentasi',3,2,'Lemari C1'),
(5,'BR005','Monitor LG','Monitor',6,6,'Rak D1'),
(6,'BR006','Laptop ASUS Vivobook 14','Laptop',4,4,'Lemari A1'),
(7,'BR007','Switch TP-Link 24 Port','Jaringan',2,2,'Rak E1'),
(8,'BR008','Router MikroTik hAP','Jaringan',3,3,'Rak E1'),
(9,'BR009','Kabel LAN Cat6 5m','Kabel',25,25,'Rak E2'),
(10,'BR010','Headset Rexus','Aksesoris',12,12,'Rak B2'),
(11,'BR011','Webcam Logitech C270','Aksesoris',6,6,'Rak B2'),
(12,'BR012','Layar Proyektor Portable','Presentasi',2,2,'Lemari C1'),
(13,'BR013','Laser Pointer Presentasi','Presentasi',5,5,'Lemari C2'),
(14,'BR014','Monitor Samsung 24 inci','Monitor',4,4,'Rak D1'),
(15,'BR015','Access Point Ubiquiti','Jaringan',3,3,'Rak E1'),
(16,'BR016','Flashdisk SanDisk 32GB','Penyimpanan',15,12,'Laci F1'),
(17,'BR017','Harddisk Eksternal 1TB','Penyimpanan',4,4,'Laci F1'),
(18,'BR018','Kabel HDMI 3m','Kabel',10,10,'Rak E2'),
(19,'BR019','Stop Kontak 6 Lubang','Kelistrikan',8,8,'Rak G1'),
(20,'BR020','UPS APC 650VA','Kelistrikan',3,3,'Rak G1');

-- ---------- TRANSAKSI CONTOH (stok di atas sudah disesuaikan) ----------
INSERT IGNORE INTO transactions
(id, kode, peminjam, item_id, item_kode, item_nama, jumlah, tanggal_pinjam, tanggal_kembali, keterangan, status, dicatat_oleh, dicatat_nama, diterima_oleh, diterima_nama, created_at, returned_at) VALUES
(1,'TRX-00001','Bayu Saputra',2,'BR002','Mouse Logitech',4,DATE_SUB(CURDATE(), INTERVAL 6 DAY),DATE_SUB(CURDATE(), INTERVAL 4 DAY),'Praktikum Basis Data','selesai',2,'Rina Lestari',1,'Administrator Lab',DATE_SUB(NOW(), INTERVAL 6 DAY),DATE_SUB(NOW(), INTERVAL 4 DAY)),
(2,'TRX-00002','Dewi Kartika',16,'BR016','Flashdisk SanDisk 32GB',3,DATE_SUB(CURDATE(), INTERVAL 9 DAY),NULL,'Ujian praktik','dipinjam',2,'Rina Lestari',NULL,NULL,DATE_SUB(NOW(), INTERVAL 9 DAY),NULL),
(3,'TRX-00003','Andi Pratama',1,'BR001','Laptop Lenovo',2,DATE_SUB(CURDATE(), INTERVAL 3 DAY),NULL,'Praktikum Pemrograman Web','dipinjam',2,'Rina Lestari',NULL,NULL,DATE_SUB(NOW(), INTERVAL 3 DAY),NULL),
(4,'TRX-00004','Siti Aminah',4,'BR004','Proyektor Epson',1,DATE_SUB(CURDATE(), INTERVAL 1 DAY),NULL,'Seminar himpunan','dipinjam',1,'Administrator Lab',NULL,NULL,DATE_SUB(NOW(), INTERVAL 1 DAY),NULL);

INSERT IGNORE INTO activity_logs (id, user_id, actor_name, aksi, detail, created_at) VALUES
(1,2,'Rina Lestari','pinjam','Dewi Kartika meminjam 3 unit Flashdisk SanDisk 32GB (TRX-00002)',DATE_SUB(NOW(), INTERVAL 9 DAY)),
(2,2,'Rina Lestari','pinjam','Bayu Saputra meminjam 4 unit Mouse Logitech (TRX-00001)',DATE_SUB(NOW(), INTERVAL 6 DAY)),
(3,1,'Administrator Lab','kembali','Bayu Saputra mengembalikan 4 unit Mouse Logitech (TRX-00001)',DATE_SUB(NOW(), INTERVAL 4 DAY)),
(4,2,'Rina Lestari','pinjam','Andi Pratama meminjam 2 unit Laptop Lenovo (TRX-00003)',DATE_SUB(NOW(), INTERVAL 3 DAY)),
(5,1,'Administrator Lab','pinjam','Siti Aminah meminjam 1 unit Proyektor Epson (TRX-00004)',DATE_SUB(NOW(), INTERVAL 1 DAY));
