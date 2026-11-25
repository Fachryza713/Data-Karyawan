import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // `npx prisma db seed`. Prisma 7 tidak lagi menjalankan seed otomatis
    // setelah `migrate dev`/`migrate reset`.
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // process.env (bukan env()) supaya `prisma generate` tetap jalan di CI
    // tanpa DATABASE_URL. Perintah migrate tetap gagal jelas jika kosong.
    url: process.env.DATABASE_URL ?? '',
    // Opsional. Kosong = `migrate dev` membuat shadow database sendiri di
    // server DATABASE_URL (cara normal dengan PostgreSQL Docker). Diisi hanya
    // untuk server yang tidak bisa CREATE DATABASE, misalnya `npx prisma dev`.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || undefined,
  },
});
