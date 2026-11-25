import { EnvValidationError, validateEnv } from './env.validation.js';

const validEnv = (): Record<string, unknown> => ({
  DATABASE_URL: 'postgresql://hris:hris@localhost:5432/hris?schema=public',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'hris-files',
  S3_ACCESS_KEY: 'minioadmin',
  S3_SECRET_KEY: 'minioadmin',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'HRIS Blue Rose Tech <no-reply@bluerose.test>',
  FRONTEND_URL: 'http://localhost:5173',
  TZ: 'Asia/Jakarta',
});

function captureError(config: Record<string, unknown>): EnvValidationError {
  try {
    validateEnv(config);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      return error;
    }
    throw error;
  }
  throw new Error('validateEnv seharusnya gagal');
}

describe('validateEnv', () => {
  it('menerima env lengkap dan mengisi default', () => {
    const env = validateEnv(validEnv());

    expect(env.SMTP_PORT).toBe(1025);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.TZ).toBe('Asia/Jakarta');
    expect(env.AUTH_COOKIE_SAMESITE).toBe('lax');
  });

  it('menolak AUTH_COOKIE_SAMESITE di luar lax/strict/none', () => {
    const error = captureError({
      ...validEnv(),
      AUTH_COOKIE_SAMESITE: 'None!',
    });

    expect(error.message).toContain(
      'AUTH_COOKIE_SAMESITE: harus salah satu dari lax, strict, none',
    );
  });

  it('mendaftar semua variabel yang kurang sekaligus', () => {
    const config = validEnv();
    delete config.DATABASE_URL;
    delete config.REDIS_URL;
    config.SMTP_HOST = '';

    const error = captureError(config);

    expect(error.message).toContain('3 masalah');
    expect(error.message).toContain('DATABASE_URL: wajib diisi');
    expect(error.message).toContain('REDIS_URL: wajib diisi');
    expect(error.message).toContain('SMTP_HOST: wajib diisi');
  });

  it('gagal jika env kosong sama sekali', () => {
    const error = captureError({});

    for (const key of Object.keys(validEnv())) {
      expect(error.message).toContain(`${key}: wajib diisi`);
    }
  });

  it.each([
    ['DATABASE_URL', 'mysql://root@localhost/hris', 'harus berupa URL'],
    ['REDIS_URL', 'http://localhost:6379', 'harus berupa URL'],
    ['S3_ENDPOINT', 'minio:9000', 'harus berupa URL'],
    ['FRONTEND_URL', 'localhost:5173', 'harus berupa URL'],
    ['SMTP_PORT', 'abc', 'harus berupa angka'],
    ['SMTP_PORT', '70000', 'harus di antara 1 dan 65535'],
    ['JWT_ACCESS_SECRET', 'pendek', 'minimal 32 karakter'],
    ['S3_BUCKET', 'Bucket_Besar', 'nama bucket S3 tidak valid'],
    ['TZ', 'Asia/Atlantis', 'zona waktu IANA tidak dikenal'],
  ])('menolak %s = %s', (key, value, expected) => {
    const error = captureError({ ...validEnv(), [key]: value });

    expect(error.message).toContain(`${key}: ${expected}`);
  });

  it('menolak JWT refresh secret yang sama dengan access secret', () => {
    const secret = 'x'.repeat(40);
    const error = captureError({
      ...validEnv(),
      JWT_ACCESS_SECRET: secret,
      JWT_REFRESH_SECRET: secret,
    });

    expect(error.message).toContain(
      'JWT_REFRESH_SECRET: harus berbeda dari JWT_ACCESS_SECRET',
    );
  });
});
