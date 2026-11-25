/**
 * Test e2e: aplikasi Nest utuh dengan konfigurasi global yang sama seperti
 * main.ts. PrismaService dan klien Redis di-mock, jadi tidak butuh Docker.
 *
 * @type {import('jest').Config}
 */
export default {
  rootDir: '..',
  testEnvironment: 'node',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true }],
  },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
};
