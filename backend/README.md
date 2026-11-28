# Backend HRIS Blue Rose Tech

REST API untuk HRIS Blue Rose Tech: NestJS 12 (TypeScript strict, ESM) + PostgreSQL 16 + Prisma 7, Redis 7 (BullMQ), storage S3-compatible, dan SMTP. Konteks fitur ada di PRD (`../PRD — HRIS Blue Rose Tech.md`).

Status: **fondasi + skema inti + auth + data karyawan + pengaturan HR + absensi**. Yang sudah ada: validasi env, logging, format error, Swagger, health check, Docker, CI, skema database inti (akun, karyawan, master organisasi, libur, audit log, pengaturan), seed data demo, ERD, auth (login JWT, refresh token berotasi, lupa/reset password, guard role, rate limit), serta data karyawan (CRUD HR dengan soft delete/restore dan email undangan, master departemen/jabatan, profil sendiri dan foto lewat presigned URL, audit log `@Audit`), dan pengaturan HR (lokasi kantor, shift, hari libur, kontak bantuan, kalender hari kerja `HolidayService`), dan absensi GPS (clock-in/out dengan radius kantor, log dan ekspor CSV HR, job alpa harian).

## Menjalankan

### Dengan Docker (disarankan)

Dari root repo:

```bash
docker compose up -d --build
docker compose exec api npx prisma migrate dev   # terapkan migrasi
docker compose exec api npm run db:seed          # isi data demo
docker compose logs -f api
docker compose logs -f worker                    # PDF slip dan email
```

| Service       | Alamat                                                                |
| ------------- | --------------------------------------------------------------------- |
| Swagger UI    | http://localhost:3000/docs                                            |
| Health check  | http://localhost:3000/health                                          |
| API           | http://localhost:3000/api/v1                                          |
| MinIO console | http://localhost:9001 (minioadmin / minioadmin)                       |
| Mailpit       | http://localhost:8025                                                 |
| Bull Board    | http://localhost:3000/admin/queues (admin / dev-only-queue-dashboard) |

Kode di `backend/` di-mount ke container, jadi perubahan file langsung memicu reload. Setelah mengubah `package.json`, bangun ulang image dan volume `node_modules`:

```bash
docker compose up -d --build -V api worker
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
npm run start:worker:dev   # terminal kedua: worker BullMQ (PDF slip, email)
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

| Perintah                               | Fungsi                                                    |
| -------------------------------------- | --------------------------------------------------------- |
| `npm run start:dev`                    | Jalankan dengan hot reload                                |
| `npm run start:worker:dev`             | Jalankan worker BullMQ dengan hot reload (`dist-worker/`) |
| `npm run start:worker:prod`            | Jalankan worker hasil build (`node dist/worker.js`)       |
| `npm run build`                        | Compile ke `dist/`                                        |
| `npm run lint`                         | ESLint + cek format Prettier                              |
| `npm run lint:fix`                     | Perbaiki lint dan format                                  |
| `npm test`                             | Unit test (`src/**/*.spec.ts`)                            |
| `npm run test:e2e`                     | Test e2e (`test/`), dependensi di-mock, tanpa Docker      |
| `npm run test:int`                     | Integration test dengan PostgreSQL asli (cuti, payroll)   |
| `npm run test:cov`                     | Unit test + coverage                                      |
| `npx prisma migrate dev --name <nama>` | Buat dan terapkan migrasi baru                            |
| `npm run db:seed`                      | Isi data demo (idempoten, aman dijalankan ulang)          |
| `npm run erd`                          | Gambar ulang ERD ke `../docs/erd.svg`                     |
| `npm run prisma:studio`                | Lihat isi database                                        |

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
│   ├── main.ts                 bootstrap API (HTTP)
│   ├── worker.ts               bootstrap worker BullMQ (tanpa HTTP), modul di worker.module.ts
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
│   ├── queue/                  BullMQ (QueueModule global), Bull Board /admin/queues
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

6 departemen, 18 jabatan, kantor "Head Office Jakarta" (radius 100 m), shift Reguler 08:30–17:30 (toleransi 15 menit), 17 libur nasional 2026 (tanggal hari raya berbasis kalender lunar masih perkiraan), `hr_contact`, dan 30 karyawan fiktif (1 sudah nonaktif sebagai contoh soft delete), masing-masing dengan struktur gaji (berlaku sejak tanggal masuk), BPJS, dan asuransi contoh (angka sama dengan `supabase/seed-demo.sql`). Jenis cuti dan tarif BPJS diisi migrasi, bukan seed.

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

`before`/`after` hanya berisi field yang berubah. Key yang mengandung `password`, `token`, `secret`, atau `hash` selalu dibuang sebelum disimpan. Aksi yang dicatat: `employee.create|update|delete|restore|self_update|photo_update`, `department.create|update|delete`, `position.create|update|delete`, `office_location.create|update|delete`, `shift.create|update|delete`, `holiday.create|delete`, `company_setting.update`.

## Pengaturan HR

| Endpoint (`/api/v1/...`)                 | Akses | Fungsi                                                                   |
| ---------------------------------------- | ----- | ------------------------------------------------------------------------ |
| `GET/POST/PATCH/DELETE office-locations` | HR    | Titik kantor: latitude -90..90, longitude -180..180, `radiusM` 25-1000   |
| `GET/POST/PATCH/DELETE shifts`           | HR    | Jam `HH:mm` WIB, `endTime` setelah `startTime`, `lateToleranceMin` 0-120 |
| `GET holidays?year=2026`                 | semua | Hari libur urut tanggal; tanpa `year` = semua tahun                      |
| `POST holidays`, `DELETE holidays/:id`   | HR    | Satu tanggal hanya satu hari libur (409)                                 |
| `GET settings/hr-contact`                | semua | Kontak HR untuk halaman Bantuan karyawan                                 |
| `GET settings/admin-contact`             | semua | Kontak admin sistem untuk halaman Bantuan HR                             |
| `PUT settings/hr-contact\|admin-contact` | HR    | Ganti seluruh kontak: `email`, `whatsapp` (`62xxxxxxxxx`), `hours`       |

- **Hapus lokasi/shift** ditolak 409 jika masih dipakai karyawan, termasuk yang nonaktif (datanya tetap merujuk lewat foreign key). Jumlahnya ada di `details.employeeCount`.
- **Koordinat** dibulatkan ke 6 angka di belakang koma (kolom `Decimal(9, 6)`, sekitar 0,1 meter). Nama lokasi dan shift unik tanpa membedakan huruf besar/kecil.
- **Shift** belum mendukung lintas tengah malam. `PATCH` yang hanya mengirim satu jam dicek terhadap jam yang tersimpan.
- Batas radius, toleransi, dan format kontak juga dijaga CHECK constraint di database (migrasi `settings_limits`).

### Hari kerja

`HolidayService` (diekspor `SettingsModule`) dipakai modul absensi, cuti, dan payroll:

```ts
await holidays.isWorkingDay('2026-08-17'); // false: Senin, libur nasional
await holidays.workingDaysBetween('2026-08-14', '2026-08-18'); // 2
```

Hari kerja = Senin-Jumat yang bukan hari libur. Rentang inklusif di kedua ujung; `start` setelah `end` menghasilkan 0. Input berupa `'YYYY-MM-DD'` atau `Date`; `Date` dibaca sebagai tanggal WIB, jadi waktu presensi `2026-11-26T18:00Z` dihitung tanggal 27 November, dan nilai kolom `@db.Date` tetap tanggal yang sama.

## Absensi

| Endpoint (`/api/v1/...`)           | Akses    | Fungsi                                                                                       |
| ---------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `POST attendances/me/clock-in`     | EMPLOYEE | Absen masuk, body `{ lat, lng, accuracy }`                                                   |
| `POST attendances/me/clock-out`    | EMPLOYEE | Absen pulang, body sama                                                                      |
| `GET attendances/me/today`         | EMPLOYEE | Absen hari ini, shift, kantor, izin WFH/dinas hari ini                                       |
| `GET attendances/me?month=YYYY-MM` | EMPLOYEE | Riwayat sebulan + ringkasan (hadir, terlambat, pulang cepat, cuti, alpa)                     |
| `GET attendances`                  | HR       | Log: `date` atau `from`-`to` (maks. 93 hari), `departmentId`, `status`, `search`, pagination |
| `GET attendances/summary?date=`    | HR       | Jumlah karyawan per status untuk satu tanggal                                                |
| `GET attendances/export`           | HR       | CSV (UTF-8 + BOM) dengan filter yang sama, di-stream per 500 baris                           |

Hanya akun role `EMPLOYEE` yang absen dan muncul di log, sama dengan versi Supabase (HR tidak absen).

**Aturan absen** (PRD 6.1, `AttendanceService`):

1. Waktu diambil dari server (`Clock`), tanggal dan jam dihitung di Asia/Jakarta. Client hanya mengirim `lat`, `lng`, `accuracy`; field lain ditolak 400.
2. Ditolak 422 jika `accuracy` > 100 m atau hari itu bukan hari kerja (`HolidayService.isWorkingDay`).
3. Jarak ke titik kantor dihitung server (`GeoService.haversineMeters`, dibulatkan ke meter). Ada izin WFH/dinas yang disetujui (`RemoteWorkPolicy`): diterima dengan mode izinnya, koordinat dan jarak tetap disimpan. Tanpa izin dan jarak > radius: 422 dengan `details: { distanceM, radiusM }`. Tepat di tepi radius masih diterima.
4. Masuk paling lambat jam masuk shift + toleransi = `ON_TIME`, selain itu `LATE` dengan `lateMinutes` dihitung dari jam masuk (minimal 1). Pulang sebelum jam pulang shift = `EARLY_LEAVE` (`lateMinutes` tetap tersimpan).
5. Absen ganda: unique `(employeeId, date)` di database. Dua request bersamaan menghasilkan satu baris; yang kalah mendapat 409 "Anda sudah absen masuk hari ini" (P2002 ditangkap). Pulang ganda dicegah `update ... where clockOutAt IS NULL`. Pulang tanpa absen masuk: 422.

`RemoteWorkPolicy` diisi `ApprovedRemoteWorkPolicy` dari modul cuti (provider `REMOTE_WORK_POLICY` di `AttendanceModule`): ada pengajuan WFH/BUSINESS_TRIP `APPROVED` yang mencakup tanggal itu = mode `WFH`/`BUSINESS_TRIP`. Pengajuan yang masih `PENDING` tidak membuka absen di luar radius.

**Log HR satu tanggal** menampilkan semua karyawan yang sudah mulai bekerja (`joinDate`), termasuk yang belum absen dengan status `NOT_YET`; karyawan yang sudah keluar hanya muncul di tanggal yang punya catatan. **Rentang** hanya menampilkan baris yang ada.

**Job alpa**: `AbsenceJob` (`@nestjs/schedule`) jalan setiap hari 23:59 WIB. Di hari kerja, karyawan aktif tanpa baris absensi ditandai `ABSENT` dengan `createMany({ skipDuplicates: true })`, jadi aman dijalankan ulang. Lock Redis per tanggal (`SET NX PX`, 15 menit, `RedisLockService`) memastikan hanya satu instance yang menjalankannya; lock tidak dilepas setelah berhasil supaya instance dengan jam sedikit terlambat tidak mengulang, dan dilepas jika gagal. Jika Redis tidak tersedia, job dilewati dan dicatat di log.

### Fake GPS

Fake GPS tidak bisa dicegah sepenuhnya dari aplikasi web. Browser hanya meneruskan koordinat dari sistem operasi, dan aplikasi pemalsu lokasi (atau DevTools > Sensors) bisa mengisi nilai apa pun, termasuk akurasi yang tampak bagus. Server tidak punya cara memverifikasi bahwa koordinat itu asli.

Mitigasinya adalah jejak audit untuk HR: setiap absen menyimpan koordinat mentah, akurasi GPS, jarak yang dihitung server, dan waktu server untuk masuk dan pulang. HR bisa melihatnya di log dan ekspor CSV untuk menemukan pola janggal, misalnya koordinat identik setiap hari atau akurasi selalu bulat. Jarak dan waktu tidak pernah diterima dari client, jadi yang bisa dipalsukan hanya posisi, bukan perhitungannya.

## Cuti, WFH, dan dinas luar

| Endpoint (`/api/v1/...`)                        | Akses        | Fungsi                                                                         |
| ----------------------------------------------- | ------------ | ------------------------------------------------------------------------------ |
| `GET leave-types`                               | EMPLOYEE, HR | Jenis cuti (sumber `leaveTypeId`)                                              |
| `POST leave-requests/me`                        | EMPLOYEE, HR | Ajukan `kind` LEAVE / WFH / BUSINESS_TRIP                                      |
| `POST leave-requests/me/attachments/upload-url` | EMPLOYEE, HR | Presigned POST lampiran JPG/PNG/PDF maks 2 MB, key `leave/<employeeId>/<uuid>` |
| `GET leave-requests/me`                         | EMPLOYEE, HR | Riwayat pengajuan sendiri                                                      |
| `POST leave-requests/me/:id/cancel`             | EMPLOYEE, HR | Batalkan milik sendiri yang masih `PENDING`                                    |
| `GET leave-balances/me?year=`                   | EMPLOYEE, HR | Saldo cuti tahunan: quota, used, remaining, pendingDays                        |
| `GET leave-requests`                            | HR           | Daftar: `status`, `kind`, `departmentId`, `from`-`to`, pagination              |
| `GET leave-requests/:id`                        | HR           | Detail + presigned URL lampiran (5 menit) + saldo                              |
| `POST leave-requests/:id/approve`               | HR           | Setujui, body `{ note? }`                                                      |
| `POST leave-requests/:id/reject`                | HR           | Tolak, body `{ note }` wajib                                                   |

Jenis cuti (`ANNUAL` 12 hari kerja dan mengurangi kuota, `SICK` lampiran wajib jika > 1 hari kerja, `SPECIAL`) diisi migrasi `leave_requests`, karena dibutuhkan juga di production (seed tidak jalan di production).

**Aturan pengajuan** (PRD 6.2, 6.3, `leave-rules.ts`): `startDate <= endDate`; hari kerja dihitung server (`HolidayService`); tidak boleh tumpang tindih dengan pengajuan `PENDING`/`APPROVED` milik sendiri (409, dan `EXCLUDE USING gist` di database untuk race dua submit); cuti tahunan tidak melebihi `quota - used` dan tidak lintas tahun; sakit > 1 hari kerja wajib lampiran yang key-nya milik karyawan itu dan object-nya ada (`HeadObject`); WFH/dinas paling lambat H-1; `destination` wajib untuk dinas. Pengajuan `PENDING` tidak memesan kuota; batasnya dijaga saat approve.

**Status**: `PENDING` bisa menjadi `APPROVED`, `REJECTED`, atau `CANCELLED`; ketiganya final. Setiap perubahan memakai `updateMany({ where: { id, status: 'PENDING' } })`, `count` 0 = 409. HR tidak bisa memproses pengajuannya sendiri (403).

**Approve** dalam satu `$transaction`: status kondisional; untuk cuti tahunan satu `UPDATE leave_balances SET used = used + n WHERE ... AND used + n <= quota` (0 baris = rollback 409 "Saldo cuti tidak cukup", tanpa baca-cek-tulis; CHECK `used <= quota` pengaman terakhir); untuk kind LEAVE baris presensi `LEAVE`/`SICK`/`PERMIT` per hari kerja (hari yang sudah absen masuk dibiarkan); AuditLog.

**Saldo** dibuat saat karyawan baru ditambahkan (di transaksi yang sama) dan oleh `LeaveBalanceJob` setiap 1 Januari 00:05 WIB (`createMany({ skipDuplicates: true })`, idempotent). Saldo juga dipastikan ada saat approve.

**Integration test** (`test/integration/`, PostgreSQL asli): dua approve paralel yang totalnya melebihi kuota (hanya satu berhasil, saldo tidak minus), approve ganda paralel, EXCLUDE dan CHECK constraint, serta absen di luar radius dengan WFH `APPROVED` vs `PENDING`.

```bash
docker compose up -d postgres-test   # dari root repo; port 5433, data di tmpfs
TEST_DATABASE_URL=postgresql://hris:hris@localhost:5433/hris_test npm run test:int
```

`globalSetup` menolak database yang namanya tidak mengandung `test`, lalu menjalankan `prisma migrate deploy` ke database itu.

## Payroll

| Endpoint (`/api/v1/...`)                                         | Akses        | Fungsi                                                          |
| ---------------------------------------------------------------- | ------------ | --------------------------------------------------------------- |
| `POST/GET employees/:id/salary-structures`                       | HR           | Tambah struktur gaji (baris baru) / riwayat                     |
| `GET/POST employees/:id/benefits`, `PATCH/DELETE .../:benefitId` | HR           | BPJS dan asuransi karyawan                                      |
| `GET/PUT payroll-configs`                                        | HR           | Tarif BPJS berlaku + riwayat / tarif baru mulai `effectiveFrom` |
| `POST/GET payroll-periods`, `GET payroll-periods/:id`            | HR           | Buat periode DRAFT, daftar, detail (slip + total)               |
| `POST payroll-periods/:id/run`                                   | HR           | Hitung slip (idempoten, hanya DRAFT)                            |
| `PATCH payroll-items/:id`                                        | HR           | Bonus, PPh 21, potongan lain, catatan (hanya DRAFT)             |
| `POST payroll-periods/:id/finalize` / `mark-paid` / `reopen`     | HR           | DRAFT -> FINAL -> PAID; FINAL -> DRAFT dengan `reason`          |
| `GET payroll-periods/:id/employer-contributions`                 | HR           | Rekap iuran bagian perusahaan per program dan per karyawan      |
| `GET payslips/me`, `GET payslips/me/:periodId`                   | EMPLOYEE, HR | Slip sendiri, hanya periode FINAL/PAID                          |
| `GET payslips/me/:periodId/pdf`                                  | EMPLOYEE, HR | Link PDF slip sendiri: 200 `{ url }` (5 menit) / 202 / 409      |
| `POST payroll-periods/:id/payslips/regenerate`                   | HR           | Buat ulang PDF slip FAILED (default) atau semua (`scope: ALL`)  |
| `GET payroll-periods/:id/payslips/status`                        | HR           | Jumlah slip per `slipStatus` + daftar slip FAILED               |
| `GET benefits/me`                                                | EMPLOYEE, HR | BPJS dan asuransi sendiri                                       |

**Uang** selalu `Prisma.Decimal` (kolom `Decimal(15,2)`, tarif `Decimal(7,4)` sebagai pecahan, `0.0100` = 1%). Di API uang dan tarif berupa teks (`"8500000.00"`); angka JSON ditolak 400 karena dibaca JavaScript sebagai float.

**Perhitungan** (`payroll-calculator.ts`, fungsi murni, PRD 6.4): dasar upah = gaji pokok + tunjangan tetap, dibatasi `wageCap` per program (BPJS Kes Rp12.000.000, JP Rp10.547.400); iuran = dasar upah x tarif, dibulatkan ke rupiah `ROUND_HALF_UP`; bruto = gaji pokok + tunjangan + bonus; take home pay = bruto - BPJS Kes - JHT - JP - PPh 21 - potongan lain. JKK dan JKM hanya bagian perusahaan. Unit test memastikan file kalkulator tidak memakai `toNumber`/`Number()`/`parseFloat`. PPh 21 diinput manual oleh HR.

**Tarif** tidak pernah ditimpa: `PUT /payroll-configs` menambah baris per program dengan `effectiveFrom` (tanggal 1); program + tanggal yang sudah ada = 409. Periode memakai tarif terbaru yang berlaku di awal bulan, dan struktur gaji terbaru yang berlaku di akhir bulan. Tarif awal ada di migrasi `payroll`.

**Run idempoten**: satu transaksi dengan `pg_advisory_xact_lock(hashtextextended('payroll-period:<id>'))`, upsert per `(periodId, employeeId)`, bonus/PPh 21/potongan lain/catatan isian HR dipertahankan, slip karyawan yang tidak lagi memenuhi syarat dihapus dari draft. Ubah slip, finalize, mark-paid, dan reopen memakai lock yang sama, lalu `updateMany` bersyarat status lama (count 0 = 409). Karyawan aktif tanpa struktur gaji dilaporkan di `skipped`. Gaji prorata (masuk/keluar tengah bulan) belum dihitung (PRD: bisa V2).

**Snapshot**: `PayrollItem` menyimpan nama, NIP, departemen, jabatan, rekening, semua angka, `employerContributions`, dan `configSnapshot` (tarif yang dipakai). Slip karyawan dibaca dari snapshot ini; menaikkan gaji setelah finalize tidak mengubah slip lama. Koreksi lewat reopen (alasan di AuditLog) lalu run ulang. Periode PAID tidak bisa dibuka lagi. CHECK constraint menjaga `gross = pokok + tunjangan + bonus` dan `net = gross - potongan`.

Semua perubahan gaji, manfaat, tarif, slip, dan status periode dicatat di AuditLog (before/after). Integration test payroll: run paralel di periode kosong (diulang 5 putaran) dan berurutan menghasilkan jumlah slip dan total yang sama, isian HR bertahan, snapshot setelah kenaikan gaji, serta karyawan tidak bisa membaca slip DRAFT atau milik orang lain.

### PDF slip (asynchronous)

PDF dibuat proses worker terpisah (`src/worker.ts`, service `worker` di docker-compose dengan image yang sama), bukan oleh request API.

1. **Finalize**: di transaksi yang sama semua slip menjadi `slipStatus = QUEUED`; setelah commit satu job per slip masuk queue `payslip-pdf` dengan `jobId = itemId`. Selama job slip itu masih menunggu/berjalan, BullMQ mengabaikan add dengan id yang sama, jadi finalize atau regenerate yang terpanggil dua kali tidak membuat job ganda. Request finalize tidak menunggu PDF. Jika Redis tidak merespons (5 detik), finalize tetap selesai dan slip ditandai `FAILED` supaya bisa dibuat ulang.
2. **Worker** (`PayslipPdfProcessor`): baca snapshot `PayrollItem`, render PDF (pdfkit: kop Blue Rose Tech, periode, nama, NIP, divisi, jabatan, penerimaan, potongan, take home pay, rekening 4 digit terakhir), upload ke `payslips/<period>/<employeeId>.pdf`, lalu `QUEUED -> READY` dengan syarat `updatedAt` belum berubah. Job lama untuk slip yang sudah tidak QUEUED atau periodenya dibuka kembali dilewati.
3. **Retry**: percobaan pertama + 3 retry, backoff eksponensial 5 s, 10 s, 20 s. Di percobaan terakhir slip menjadi `FAILED` + `slipError`.
4. **Email**: setelah READY, email "Slip gaji <bulan> sudah terbit" masuk queue `mail` (dikirim worker, 5 percobaan). Isinya link ke `FRONTEND_URL/app/gaji`, tanpa lampiran. Regenerate slip yang sudah pernah READY tidak mengirim email lagi.
5. **Karyawan**: `GET payslips/me/:periodId/pdf` = 200 `{ url, expiresAt }` (presigned 5 menit) jika READY, 202 + `Retry-After` jika QUEUED, 409 jika FAILED/NONE (perlu HR), 404 jika periode DRAFT atau bukan slip sendiri.
6. **Reopen**: status slip kembali `NONE` di transaksi reopen, PDF lama dihapus dari storage setelah commit.

Bull Board (`/admin/queues`, di luar `/api/v1`) hanya aktif jika `ENABLE_QUEUE_DASHBOARD=true`, dilindungi basic auth `QUEUE_DASHBOARD_USER`/`QUEUE_DASHBOARD_PASSWORD` (minimal 12 karakter).

## Image produksi

```bash
docker build --target prod -t hris-api backend
```

Image `prod` hanya berisi `dist/` dan dependency produksi, jalan sebagai user `node`. Worker memakai image yang sama dengan command `node dist/worker.js`. Image ini tidak menyertakan Prisma CLI, jadi migrasi dijalankan terpisah (`npm run prisma:deploy` dari CI atau container `dev`).
