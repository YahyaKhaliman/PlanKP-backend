# PlanKP Backend API

Node.js + Express REST API yang mendukung aplikasi PlanKP (penjadwalan maintenance). Backend ini menggunakan Sequelize untuk berinteraksi dengan database MySQL dan menerapkan autentikasi JWT, pembatasan akses berdasarkan jabatan/divisi, serta modul-modul master data, jadwal, dan realisasi.

## Menjalankan Proyek

1. `npm install`
2. Salin `.env.example` menjadi `.env`, kemudian isi variabel berikut:
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`
   - `JWT_SECRET` dan `JWT_EXPIRES_IN`
   - `PORT` (opsional, default 3000)
3. Pastikan database sudah dibuat serta migrasi dijalankan.
4. Jalankan `npm run dev` untuk pengembangan (dengan nodemon) atau `npm start` untuk produksi.

## Rute Utama

- `GET /api/health` – pengecekan status server
- `POST /api/auth/login` – autentikasi
- `GET /api/master/jadwal` – daftar jadwal (dengan filter, pagination)
- `POST /api/master/realisasi` – membuat realisasi maintenance
- `GET /api/master/dashboard/summary` – ringkasan KPI sesuai scope user

## Struktur Direktori

```
src/
  controllers/   # logika bisnis per modul
  routes/        # definisi endpoint Express
  middleware/    # auth, logger, validator, error handler
  services/      # helper/service auth & user
  utils/         # response formatter, pagination, date helper
  models/        # definisi Sequelize
```
