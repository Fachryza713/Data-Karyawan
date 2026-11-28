/**
 * Integration test dengan PostgreSQL asli (test/integration/**\/*.int-spec.ts).
 * Butuh TEST_DATABASE_URL ke database khusus test (nama database harus
 * mengandung "test"), contoh service postgres-test di docker-compose.yml:
 *
 *   docker compose up -d postgres-test
 *   TEST_DATABASE_URL=postgresql://hris:hris@localhost:5433/hris_test npm run test:int
 *
 * globalSetup menjalankan `prisma migrate deploy` ke database itu dulu.
 *
 * @type {import('jest').Config}
 */
export default {
  rootDir: '..',
  testEnvironment: 'node',
  testRegex: 'test/integration/.*\\.int-spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true }],
  },
  setupFiles: ['<rootDir>/test/preload-cjs.ts'],
  globalSetup: '<rootDir>/test/integration/global-setup.ts',
  // Satu file per waktu: semua test memakai database yang sama.
  maxWorkers: 1,
  testTimeout: 30_000,
};
