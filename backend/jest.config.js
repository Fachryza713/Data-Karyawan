/**
 * Unit test (src/**\/*.spec.ts). Proyek ini ESM (paket Nest 12 hanya ESM),
 * jadi Jest dijalankan dengan --experimental-vm-modules (lihat script "test").
 *
 * @type {import('jest').Config}
 */
export default {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  extensionsToTreatAsEsm: ['.ts'],
  // Import relatif ditulis dengan akhiran .js (aturan ESM); arahkan ke file .ts.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true }],
  },
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.spec.ts',
    '!generated/**',
    '!main.ts',
  ],
  coverageDirectory: '../coverage',
};
