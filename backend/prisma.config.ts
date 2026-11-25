import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // process.env (bukan env()) supaya `prisma generate` tetap jalan di CI
    // tanpa DATABASE_URL. Perintah migrate tetap gagal jelas jika kosong.
    url: process.env.DATABASE_URL ?? '',
  },
});
