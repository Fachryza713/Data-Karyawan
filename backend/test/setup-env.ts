// Env lengkap untuk test e2e. Diisi sebelum AppModule dimuat karena
// ConfigModule memvalidasi env saat modul dibuat.
const testEnv: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://hris:hris@localhost:5432/hris_test?schema=public',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'hris-test',
  S3_ACCESS_KEY: 'test',
  S3_SECRET_KEY: 'test-secret',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'HRIS Test <no-reply@bluerose.test>',
  FRONTEND_URL: 'http://localhost:5173',
  TZ: 'Asia/Jakarta',
};

Object.assign(process.env, testEnv);
