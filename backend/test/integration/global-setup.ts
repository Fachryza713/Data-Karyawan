import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

/**
 * Dijalankan sekali sebelum integration test. File ini dimuat Node langsung
 * (bukan lewat transform Jest), jadi tidak mengimpor modul proyek.
 *
 * 1. TEST_DATABASE_URL wajib diisi dan nama database-nya harus mengandung
 *    "test": test menulis dan menghapus data, jadi tidak boleh menyentuh
 *    database development/production.
 * 2. `prisma migrate deploy` menerapkan migrasi yang ada ke database itu
 *    (tidak membuat migrasi baru), sama seperti di production.
 */
export default function globalSetup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL belum diisi. Contoh: ' +
        'postgresql://hris:hris@localhost:5433/hris_test ' +
        '(docker compose up -d postgres-test)',
    );
  }
  const database = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(database)) {
    throw new Error(
      `TEST_DATABASE_URL harus menunjuk database khusus test (nama mengandung "test"), bukan "${database}"`,
    );
  }

  const prismaCli = createRequire(import.meta.url).resolve(
    'prisma/build/index.js',
  );
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
