# PlanKP Backend API

PlanKP Backend API adalah REST API berbasis **Node.js** dan **Express.js** yang berfungsi sebagai mesin utama penyedia data untuk aplikasi penjadwalan preventive maintenance PlanKP. Backend ini menggunakan **Sequelize ORM** untuk berinteraksi dengan database MySQL, menerapkan keamanan berbasis **JSON Web Token (JWT)**, serta manajemen hak akses bertingkat berdasarkan jabatan dan divisi user.

---

## 🚀 Fitur Backend

- **Autentikasi JWT**: Manajemen token login aman, pengecekan data sesi (`/me`), dan perubahan kata sandi.
- **Role & Scope Authorization**: Proteksi route untuk membatasi aksi berdasarkan divisi (GA, IT, Driver) dan jabatan (Admin, User/Teknisi).
- **Sequelize ORM Integration**: Model terstruktur untuk manipulasi data MySQL secara aman dengan proteksi SQL Injection otomatis.
- **Cross-Database Queries**: Mendukung query ke database pembantu (`DB_HELPER` untuk data pabrik/cabang) dan database HRD (`DB_HRD` untuk membaca hari libur nasional).
- **Upload File Berkas**: Middleware **Multer** terintegrasi untuk menangani penyimpanan bukti foto realisasi maintenance.

---

## 📁 Struktur Direktori

```text
src/
├── config/          # Konfigurasi koneksi Sequelize database
├── controllers/     # Logika bisnis per modul (auth, jadwal, realisasi, dll.)
├── middleware/      # Otorisasi JWT, logging request, error handler, & validator
├── models/          # Definisi skema tabel & relasi Sequelize
├── routes/          # Definisi endpoint/rute Express.js
├── services/        # Helper service untuk autentikasi dan pencarian user
├── utils/           # Response formatter, pembantu pagination, & penentu tanggal
└── index.js         # Entry point utama inisialisasi server Express & database
```

---

## ⚙️ Persyaratan Sistem

Sebelum menjalankan proyek, pastikan perangkat Anda memiliki:

- **Node.js**: Versi `>= 16.x`
- **npm**: Versi `>= 8.x`
- **MySQL Database Server**: Versi `>= 5.7` atau MariaDB equivalent

---

## 🛠️ Setup Awal & Jalankan di Lokal

### 1. Install Dependensi Proyek

Jalankan perintah berikut di root folder backend:

```bash
npm install
```

### 2. Konfigurasi Variabel Lingkungan (.env)

1. Salin berkas `.env.example` menjadi `.env`:
   ```bash
   cp .env.example .env
   ```
2. Sesuaikan konfigurasi koneksi database Anda di berkas `.env`:

   ```env
   PORT=3000
   NODE_ENV=development

   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=plan_kp_db
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_HELPER=kencanaprint
   DB_HRD=db_hrd

   JWT_SECRET=gunakan_kunci_rahasia_dan_panjang_disini
   JWT_EXPIRES_IN=8h
   ```

   _Penting: Pastikan database dengan nama `plan_kp_db` sudah dibuat di server MySQL lokal Anda._

### 3. Inisialisasi Database & Seeding

Untuk mempermudah setup pertama kali, telah disediakan script otomatis yang akan mensinkronisasikan model Sequelize ke MySQL (membuat semua tabel secara otomatis) dan memasukkan data awal pengujian (seeds):

```bash
npm run db:init
```

Perintah di atas menjalankan dua proses secara berurutan:

- `npm run db:sync`: Menjalankan `seeders/sync.js` untuk membuat seluruh tabel skema model.
- `npm run seed`: Memasukkan data seeder bawaan (user pengujian, tipe maintenance, daftar unit, checklist template, dll.).

### 4. Jalankan Aplikasi

- **Mode Pengembangan (dengan hot reload via nodemon):**
  ```bash
  npm run dev
  ```
- **Mode Produksi:**
  ```bash
  npm start
  ```

---

## 🛣️ Rute Utama API

Seluruh endpoint API memiliki prefix `/api`. Berikut beberapa rute kunci:

| Metode   | Rute                            | Deskripsi                                             | Hak Akses       |
| -------- | ------------------------------- | ----------------------------------------------------- | --------------- |
| **GET**  | `/api/health`                   | Pengecekan kesehatan & koneksi API                    | Publik          |
| **POST** | `/api/auth/login`               | Autentikasi user & penerbitan token                   | Publik          |
| **GET**  | `/api/auth/me`                  | Membaca profil user aktif berdasarkan token           | Token JWT Valid |
| **GET**  | `/api/master/jadwal`            | Mendapatkan daftar jadwal (filter & pagination)       | Token JWT Valid |
| **POST** | `/api/master/realisasi`         | Membuat laporan realisasi maintenance                 | Teknisi / User  |
| **POST** | `/api/master/realisasi/:id/ttd` | Menyimpan tanda tangan digital & menyelesaikan jadwal | Teknisi / User  |
| **GET**  | `/api/master/dashboard/summary` | KPI Summary sesuai cakupan divisi & cabang            | Token JWT Valid |
