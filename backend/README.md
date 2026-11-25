# Backend HRIS Blue Rose Tech

REST API untuk HRIS Blue Rose Tech: NestJS 12 (TypeScript strict, ESM) + PostgreSQL 16 + Prisma 7, Redis 7 (BullMQ), storage S3-compatible, dan SMTP. Konteks fitur ada di PRD (`../PRD — HRIS Blue Rose Tech.md`).

Status: **fondasi + skema inti**. Belum ada endpoint bisnis. Yang sudah ada: validasi env, logging, format error, Swagger, health check, Docker, CI, skema database inti (akun, karyawan, master organisasi, libur, audit log, pengaturan), seed data demo, dan ERD.

## Menjalankan

### Dengan Docker (disarankan)

Dari root repo:

```bash
docker compose up -d --build
docker compose exec api npx prisma migrate dev   # terapkan migrasi
docker compose exec api npm run db:seed          # isi data demo
docker compose logs -f api
```

| Service       | Alamat                                          |
| ------------- | ----------------------------------------------- |
| Swagger UI    | http://localhost:3000/docs                      |
| Health check  | http://localhost:3000/health                    |
| API           | http://localhost:3000/api/v1                    |
| MinIO console | http://localhost:9001 (minioadmin / minioadmin) |
| Mailpit       | http://localhost:8025                           |

Kode di `backend/` di-mount ke container, jadi perubahan file langsung memicu reload. Setelah mengubah `package.json`, bangun ulang image dan volume `node_modules`:

```bash
docker compose up -d --build -V api
```

### Langsung di host

Butuh Node.js 24+ serta PostgreSQL, Redis, MinIO, dan Mailpit yang jalan (misalnya `docker compose up -d postgres redis minio minio-init mailpit`).

```bash
cd backend
cp .env.example .env
npm install          # juga menjalankan prisma generate
npx prisma migrate dev
npm run db:seed
npm run start:dev
```

### Tanpa Docker: database lokal `prisma dev`

Untuk mencoba migrasi dan seed tanpa Docker, Prisma menyediakan PostgreSQL lokal (PGlite, PostgreSQL 17 versi WebAssembly). Cukup untuk migrasi, seed, dan Prisma Studio; target utama tetap PostgreSQL 16 di Docker.

```bash
npx prisma dev --name hris --detach   # cetak URL TCP, contoh port 51214
npx prisma dev ls                     # lihat URL lagi
```

Isi `.env` dengan URL TCP-nya, lalu jalankan migrasi dan seed seperti biasa. PGlite tidak bisa `CREATE DATABASE`, jadi shadow database diarahkan ke port kedua:

```
DATABASE_URL=postgres://postgres:postgres@localhost:51214/template1?sslmode=disable
SHADOW_DATABASE_URL=postgres://postgres:postgres@localhost:51215/template1?sslmode=disable
```

Hentikan dengan `npx prisma dev stop hris`.

Jika ada env yang kurang atau salah, aplikasi berhenti dengan daftar variabelnya:

```
Konfigurasi environment tidak valid (2 masalah):
  - DATABASE_URL: wajib diisi
  - JWT_ACCESS_SECRET: minimal 32 karakter
```

## Script

| Perintah                               | Fungsi                                               |
| -------------------------------------- | ---------------------------------------------------- |
| `npm run start:dev`                    | Jalankan dengan hot reload                           |
| `npm run build`                        | Compile ke `dist/`                                   |
| `npm run lint`                         | ESLint + cek format Prettier                         |
| `npm run lint:fix`                     | Perbaiki lint dan format                             |
| `npm test`                             | Unit test (`src/**/*.spec.ts`)                       |
| `npm run test:e2e`                     | Test e2e (`test/`), dependensi di-mock, tanpa Docker |
| `npm run test:cov`                     | Unit test + coverage                                 |
| `npx prisma migrate dev --name <nama>` | Buat dan terapkan migrasi baru                       |
| `npm run db:seed`                      | Isi data demo (idempoten, aman dijalankan ulang)     |
| `npm run erd`                          | Gambar ulang ERD ke `../docs/erd.svg`                |
| `npm run prisma:studio`                | Lihat isi database                                   |

## Struktur

```
backend/
├── prisma/
│   ├── schema.prisma           skema database
│   ├── migrations/             migrasi SQL (hasil prisma migrate dev)
│   ├── seed.ts                 seed idempoten (npm run db:seed)
│   └── seed-data.ts            data contoh (fiktif)
├── prisma.config.ts            konfigurasi Prisma CLI (DATABASE_URL, seed)
├── scripts/generate-erd.ts     schema.prisma -> ../docs/erd.svg
├── src/
│   ├── main.ts                 bootstrap
│   ├── app.module.ts           modul root
│   ├── app.setup.ts            konfigurasi global (dipakai main.ts dan test e2e)
│   ├── config/                 validasi env (zod), logger, Swagger
│   ├── common/
│   │   ├── validation/         format bersama (NIP, jam HH:mm, email)
│   │   ├── filters/            AllExceptionsFilter (format error + error Prisma)
│   │   ├── http/               request id
│   │   ├── dto/                ErrorResponseDto
│   │   ├── guards/             (auth/role guard menyusul)
│   │   ├── decorators/         (@Roles dan lainnya menyusul)
│   │   └── interceptors/
│   ├── prisma/                 PrismaModule global, PrismaService, extension soft delete
│   ├── redis/                  klien Redis global
│   ├── modules/                modul fitur (saat ini: health)
│   └── generated/prisma/       hasil prisma generate (tidak di-commit)
└── test/                       test e2e
```

## Konvensi

- **API**: semua endpoint di bawah `/api/v1`, kecuali `GET /health`. Semua endpoint didokumentasikan di Swagger.
- **Error**: selalu `{ statusCode, error, message, path, timestamp, requestId }`. Error Prisma `P2002` menjadi 409, `P2025` menjadi 404, error lain menjadi 500 tanpa detail (detail hanya di log).
- **Request id**: header `X-Request-Id` dari klien dipakai jika aman, selain itu dibuat UUID. Nilainya sama di header respons, body error, dan log.
- **Validasi**: semua input lewat DTO `class-validator`. `ValidationPipe` global memakai `whitelist`, `forbidNonWhitelisted`, dan `transform`.
- **Otorisasi**: dicek di server dengan guard dan `@Roles`. Endpoint karyawan memakai `/me` dan mengambil ID dari JWT, bukan dari parameter.
- **Aturan bisnis**: ditulis di service, bukan di controller. Setiap aturan baru punya unit test.
- **Database**: perubahan skema hanya lewat `npx prisma migrate dev --name <nama>`. Migrasi lama tidak diedit dan database tidak diubah manual.
- **Uang**: selalu `Prisma.Decimal` (kolom `Decimal`), tidak pernah `number`/`Float`.
- **Query database**: lewat `PrismaService.client` (`this.prisma.client.employee...`). Klien ini sudah memasang extension soft delete; PrismaClient polos sengaja tidak diekspos.
- **ESM**: import relatif memakai akhiran `.js` (`import { X } from './x.js'`). Jest berjalan dalam mode ESM; `jest` diimpor dari `@jest/globals`.
- **Referensi aturan lama**: `../supabase/migrations` dan PRD.

## Database

Diagram: [`docs/erd.svg`](../docs/erd.svg), dibuat dari `schema.prisma` dengan `npm run erd`. Jalankan ulang dan commit setiap kali skema berubah.

| Tabel              | Isi                                                                         |
| ------------------ | --------------------------------------------------------------------------- |
| `users`            | Akun login: email (huruf kecil, unik), hash argon2id, role `HR`/`EMPLOYEE`  |
| `employees`        | Data karyawan, 1-1 dengan `users`; NIP `BRT-YYYY-NNNN`; soft delete         |
| `departments`      | Departemen                                                                  |
| `positions`        | Jabatan, milik satu departemen (nama unik per departemen)                   |
| `office_locations` | Titik kantor (latitude/longitude `decimal(9,6)`, radius meter)              |
| `shifts`           | Jam kerja `HH:mm` WIB dan toleransi terlambat                               |
| `holidays`         | Libur nasional (tanggal unik)                                               |
| `audit_logs`       | Jejak perubahan: aktor, aksi, entitas, data sebelum/sesudah, IP, user agent |
| `company_settings` | Pengaturan key/value JSON, contoh `hr_contact`                              |

Catatan desain:

- **id** UUIDv7 (urut waktu) dibuat Prisma Client; kolom `uuid`. Timestamp `timestamptz`, tanggal kalender `date`.
- **CHECK constraint** (format NIP, email huruf kecil, jam shift, koordinat, radius, key pengaturan) ditulis di SQL migrasi `core_schema` karena Prisma Schema belum mendukungnya. Validasi utama tetap di DTO.
- **Pencarian** nama/NIP memakai index GIN `pg_trgm` (untuk `contains` / `ILIKE '%kata%'`). Filter daftar karyawan memakai index `(department_id, deleted_at)` dan `deleted_at`.
- **Soft delete** karyawan: `client.employee.*` otomatis hanya melihat baris `deleted_at IS NULL`, dan update ke karyawan terhapus gagal 404 (P2025). Tulis `deletedAt` sendiri di `where` untuk melihat yang terhapus, atau sebar `INCLUDE_DELETED` untuk semua. `client.employee.softDelete(id)` dan `restore(id)` tersedia. Filter otomatis tidak berlaku untuk relasi bertingkat (misalnya `department.employees`); di sana pakai `where: ACTIVE_EMPLOYEE`.

### Data demo (`npm run db:seed`)

6 departemen, 18 jabatan, kantor "Head Office Jakarta" (radius 100 m), shift Reguler 08:30–17:30 (toleransi 15 menit), 17 libur nasional 2026 (tanggal hari raya berbasis kalender lunar masih perkiraan), `hr_contact`, dan 30 karyawan fiktif (1 sudah nonaktif sebagai contoh soft delete).

| Email                    | Role     | Karyawan                            |
| ------------------------ | -------- | ----------------------------------- |
| `hr@bluerose.test`       | HR       | Dian Lestari, HR Manager            |
| `karyawan@bluerose.test` | EMPLOYEE | Raditya Pratama, Frontend Developer |

Password kedua akun: `SEED_DEMO_PASSWORD`, default `BlueRose#2026`. Karyawan fiktif lain mendapat password acak yang tidak dicetak. Seed menolak jalan jika `NODE_ENV=production`. Upsert memakai `update: {}`, jadi menjalankan ulang tidak menimpa perubahan yang dibuat lewat aplikasi.

## Image produksi

```bash
docker build --target prod -t hris-api backend
```

Image `prod` hanya berisi `dist/` dan dependency produksi, jalan sebagai user `node`. Image ini tidak menyertakan Prisma CLI, jadi migrasi dijalankan terpisah (`npm run prisma:deploy` dari CI atau container `dev`).
