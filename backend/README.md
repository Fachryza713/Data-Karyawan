# Backend HRIS Blue Rose Tech

REST API untuk HRIS Blue Rose Tech: NestJS 12 (TypeScript strict, ESM) + PostgreSQL 16 + Prisma 7, Redis 7 (BullMQ), storage S3-compatible, dan SMTP. Konteks fitur ada di PRD (`../PRD — HRIS Blue Rose Tech.md`).

Status: **fondasi**. Belum ada model atau fitur bisnis. Yang sudah ada: validasi env, logging, format error, Swagger, health check, Docker, dan CI.

## Menjalankan

### Dengan Docker (disarankan)

Dari root repo:

```bash
docker compose up -d --build
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
npm run start:dev
```

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
| `npm run prisma:studio`                | Lihat isi database                                   |

## Struktur

```
backend/
├── prisma/schema.prisma        skema database (belum ada model)
├── prisma.config.ts            konfigurasi Prisma CLI (DATABASE_URL)
├── src/
│   ├── main.ts                 bootstrap
│   ├── app.module.ts           modul root
│   ├── app.setup.ts            konfigurasi global (dipakai main.ts dan test e2e)
│   ├── config/                 validasi env (zod), logger, Swagger
│   ├── common/
│   │   ├── filters/            AllExceptionsFilter (format error + error Prisma)
│   │   ├── http/               request id
│   │   ├── dto/                ErrorResponseDto
│   │   ├── guards/             (auth/role guard menyusul)
│   │   ├── decorators/         (@Roles dan lainnya menyusul)
│   │   └── interceptors/
│   ├── prisma/                 PrismaModule global + PrismaService
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
- **ESM**: import relatif memakai akhiran `.js` (`import { X } from './x.js'`). Jest berjalan dalam mode ESM; `jest` diimpor dari `@jest/globals`.
- **Referensi aturan lama**: `../supabase/migrations` dan PRD.

## Image produksi

```bash
docker build --target prod -t hris-api backend
```

Image `prod` hanya berisi `dist/` dan dependency produksi, jalan sebagai user `node`. Image ini tidak menyertakan Prisma CLI, jadi migrasi dijalankan terpisah (`npm run prisma:deploy` dari CI atau container `dev`).
