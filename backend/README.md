# Backend HRIS Blue Rose Tech

REST API untuk HRIS Blue Rose Tech: NestJS 12 (TypeScript strict, ESM) + PostgreSQL 16 + Prisma 7, Redis 7 (BullMQ), storage S3-compatible, dan SMTP. Konteks fitur ada di PRD (`../PRD — HRIS Blue Rose Tech.md`).

Status: **fondasi + skema inti + auth + data karyawan**. Yang sudah ada: validasi env, logging, format error, Swagger, health check, Docker, CI, skema database inti (akun, karyawan, master organisasi, libur, audit log, pengaturan), seed data demo, ERD, auth (login JWT, refresh token berotasi, lupa/reset password, guard role, rate limit), serta data karyawan (CRUD HR dengan soft delete/restore dan email undangan, master departemen/jabatan, profil sendiri dan foto lewat presigned URL, audit log `@Audit`).

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
│   │   ├── auth/               tipe AuthUser dan payload access token
│   │   ├── throttler/          storage Redis untuk @nestjs/throttler
│   │   ├── validation/         format bersama (NIP, telepon, tanggal YYYY-MM-DD) dan validator DTO
│   │   ├── filters/            AllExceptionsFilter (format error + error Prisma)
│   │   ├── http/               request id
│   │   ├── dto/                ErrorResponseDto, pagination, NamedRefDto
│   │   ├── guards/             JwtAuthGuard, RolesGuard (global)
│   │   ├── decorators/         @Public, @Roles, @CurrentUser, @RequestClientMeta
│   │   └── interceptors/
│   ├── prisma/                 PrismaModule global, PrismaService, extension soft delete
│   ├── redis/                  klien Redis global
│   ├── modules/                modul fitur: auth, audit, mail, storage, employees, organization, health
│   └── generated/prisma/       hasil prisma generate (tidak di-commit)
└── test/                       test e2e dan fixtures/ (data mock bersama unit test)
```

## Konvensi

- **API**: semua endpoint di bawah `/api/v1`, kecuali `GET /health`. Semua endpoint didokumentasikan di Swagger.
- **Error**: selalu `{ statusCode, error, message, path, timestamp, requestId }`, plus `details` untuk sebagian error (contoh jumlah pemakai saat hapus ditolak 409). Error Prisma `P2002` dan `P2003` menjadi 409, `P2025` menjadi 404, error lain menjadi 500 tanpa detail (detail hanya di log).
- **Daftar**: endpoint list memakai `?page=&limit=` (limit maksimal 100) dan membalas `{ data, meta: { page, limit, total, totalPages } }`.
- **Response**: dibentuk lewat DTO keluaran dari `select` eksplisit, bukan objek Prisma mentah. File di storage dikirim sebagai presigned URL (`photoUrl`), bukan object key.
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

| Tabel                   | Isi                                                                         |
| ----------------------- | --------------------------------------------------------------------------- |
| `users`                 | Akun login: email (huruf kecil, unik), hash argon2id, role `HR`/`EMPLOYEE`  |
| `refresh_tokens`        | Sesi login: hash SHA-256 refresh token, family, rotasi, pencabutan          |
| `password_reset_tokens` | Token reset password sekali pakai (hash SHA-256, 30 menit)                  |
| `employees`             | Data karyawan, 1-1 dengan `users`; NIP `BRT-YYYY-NNNN`; soft delete         |
| `departments`           | Departemen                                                                  |
| `positions`             | Jabatan, milik satu departemen (nama unik per departemen)                   |
| `office_locations`      | Titik kantor (latitude/longitude `decimal(9,6)`, radius meter)              |
| `shifts`                | Jam kerja `HH:mm` WIB dan toleransi terlambat                               |
| `holidays`              | Libur nasional (tanggal unik)                                               |
| `audit_logs`            | Jejak perubahan: aktor, aksi, entitas, data sebelum/sesudah, IP, user agent |
| `company_settings`      | Pengaturan key/value JSON, contoh `hr_contact`                              |

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

## Auth

| Endpoint (`/api/v1/auth/...`) | Akses        | Fungsi                                                           |
| ----------------------------- | ------------ | ---------------------------------------------------------------- |
| `POST login`                  | publik       | Email + password, balas `{ accessToken, user }` + cookie refresh |
| `POST refresh`                | cookie       | Rotasi refresh token, balas access token baru                    |
| `POST logout`                 | cookie       | Cabut sesi perangkat ini, hapus cookie                           |
| `POST logout-all`             | access token | Cabut semua sesi user                                            |
| `POST forgot-password`        | publik       | Selalu 200; kirim link reset jika email terdaftar dan akun aktif |
| `POST reset-password`         | publik       | Token + password baru (min. 8 karakter), cabut semua sesi        |
| `GET me`                      | access token | Data akun + karyawan yang login                                  |

- **Access token** JWT HS256 (`JWT_ACCESS_SECRET`), 15 menit, berisi `sub`, `role`, `employeeId`. Dikirim sebagai `Authorization: Bearer <token>`.
- **Refresh token** 256-bit acak, 7 hari, disimpan sebagai hash SHA-256. Cookie `refresh_token`: httpOnly, path `/api/v1/auth`, `SameSite` dari `AUTH_COOKIE_SAMESITE` (default `lax`; pakai `none` jika frontend beda domain), Secure di produksi atau saat `none`.
- **Rotasi**: setiap refresh mencabut token lama (`revoked_at`, `replaced_by_id`) dan menerbitkan token baru di family yang sama. Token yang sudah dirotasi lalu dipakai lagi dianggap bocor: seluruh family dicabut (401) dan dicatat `auth.refresh_reuse_detected`. Token yang dicabut karena logout hanya ditolak 401.
- **Login**: email tak terdaftar dan password salah mendapat pesan sama ("Email atau password salah") dan tetap menjalankan argon2, supaya tidak bisa menebak email. Akun nonaktif atau karyawan yang sudah di-soft delete ditolak 403 setelah password benar.
- **Lupa password**: link `FRONTEND_URL/update-password?token=...`, berlaku 30 menit, sekali pakai; link lama dibatalkan saat meminta yang baru. Diproses di latar belakang supaya waktu respons tidak membocorkan email terdaftar.
- **Rate limit** (`@nestjs/throttler`, storage Redis, per IP + email): login 5 per menit, forgot-password 3 per jam. Lewat batas: 429 dengan header `Retry-After`.
- **Audit log**: `auth.login_success`, `auth.login_failed` (alasan: `unknown_email`, `wrong_password`, `inactive`), `auth.password_reset`, `auth.refresh_reuse_detected`.
- Access token stateless: akun yang dinonaktifkan masih bisa memakai access token yang sudah terbit sampai kedaluwarsa (maks. 15 menit), tetapi tidak bisa refresh.

### Otorisasi di controller

Semua endpoint wajib login (guard global `JwtAuthGuard`), kecuali diberi `@Public()`. Batasi role dengan `@Roles(Role.HR)` (guard global `RolesGuard`, 403 untuk role lain). Ambil user dari token dengan `@CurrentUser()`, jangan dari parameter:

```ts
@ApiBearerAuth()
@Roles(Role.HR)
@Get('employees')
list(@CurrentUser() user: AuthUser) { ... }
```

## Data karyawan

| Endpoint (`/api/v1/...`)             | Akses | Fungsi                                                                  |
| ------------------------------------ | ----- | ----------------------------------------------------------------------- |
| `GET employees`                      | HR    | Pagination, `search` (nama/NIP/email), filter departemen/jabatan/status |
| `GET employees/:id`                  | HR    | Detail, termasuk karyawan nonaktif                                      |
| `POST employees`                     | HR    | Buat User + Employee (satu transaksi), kirim email undangan             |
| `PATCH employees/:id`                | HR    | Ubah data karyawan aktif                                                |
| `DELETE employees/:id`               | HR    | Soft delete: `deletedAt`, akun nonaktif, semua refresh token dicabut    |
| `POST employees/:id/restore`         | HR    | Pulihkan karyawan nonaktif                                              |
| `GET/POST/PATCH/DELETE departments`  | HR    | Master departemen; hapus ditolak 409 jika masih dipakai                 |
| `GET/POST/PATCH/DELETE positions`    | HR    | Master jabatan; hapus/pindah departemen ditolak 409 jika masih dipakai  |
| `GET employees/me`                   | semua | Data karyawan yang login                                                |
| `PATCH employees/me`                 | semua | Hanya `fullName`, `phone`, `gender`, `birthDate`                        |
| `POST employees/me/photo/upload-url` | semua | Presigned POST foto (JPG/PNG, maks. 2 MB)                               |
| `PATCH employees/me/photo`           | semua | Konfirmasi foto yang sudah diunggah, hapus foto lama                    |

- **NIP** `BRT-YYYY-NNNN` (disimpan huruf besar) dan **email** unik. NIP dicek terhadap semua karyawan, termasuk yang nonaktif. Jabatan harus milik departemen karyawan.
- **Undangan**: akun baru diberi password acak, lalu email berisi link `FRONTEND_URL/update-password?token=...` (token `PasswordResetToken`, 72 jam, sekali pakai). Diselesaikan lewat `POST /auth/reset-password`. Jika email gagal, karyawan tetap dibuat (`invitationSent: false`) dan bisa memakai "Lupa password".
- **Soft delete**: karyawan nonaktif tidak muncul di daftar default (`status=inactive` untuk melihatnya), tidak bisa login atau refresh, dan riwayatnya tetap ada. HR tidak bisa menonaktifkan akunnya sendiri.
- **Foto**: bucket privat. Server mengecek tipe dan ukuran sebelum membuat URL; policy presigned POST mengunci `Content-Type` dan ukuran 1..2 MB di storage. Saat konfirmasi, key harus `employees/<id-sendiri>/avatar-<uuid>` dan isi file dicek (magic bytes JPG/PNG); file yang tidak lolos dihapus. `S3_PUBLIC_ENDPOINT` mengatur host presigned URL jika berbeda dari `S3_ENDPOINT` (Docker: `http://localhost:9000`).

### Audit log

Endpoint yang mengubah data diberi `@Audit('employee.update')`. `AuditInterceptor` (global) menyiapkan konteks request (aksi, actor dari JWT, IP, user agent) lewat `AsyncLocalStorage`, lalu service mencatat perubahannya di transaksi yang sama:

```ts
await this.audit.recordChange(
  { entity: 'Employee', entityId: id, before, after },
  tx,
);
```

`before`/`after` hanya berisi field yang berubah. Key yang mengandung `password`, `token`, `secret`, atau `hash` selalu dibuang sebelum disimpan. Aksi yang dicatat: `employee.create|update|delete|restore|self_update|photo_update`, `department.create|update|delete`, `position.create|update|delete`.

## Image produksi

```bash
docker build --target prod -t hris-api backend
```

Image `prod` hanya berisi `dist/` dan dependency produksi, jalan sebagai user `node`. Image ini tidak menyertakan Prisma CLI, jadi migrasi dijalankan terpisah (`npm run prisma:deploy` dari CI atau container `dev`).
