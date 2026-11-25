import { z } from 'zod';

const REQUIRED = 'wajib diisi';

const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const urlWithProtocol = (protocol: RegExp, hint: string) =>
  z.url({ protocol, error: `harus berupa URL ${hint}` });

const port = z.coerce
  .number({ error: 'harus berupa angka' })
  .int('harus bilangan bulat')
  .min(1, 'harus di antara 1 dan 65535')
  .max(65535, 'harus di antara 1 dan 65535');

const secret = z.string().min(32, 'minimal 32 karakter');

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: port.default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DATABASE_URL: urlWithProtocol(
      /^postgres(ql)?$/,
      'postgresql://user:password@host:5432/db',
    ),
    REDIS_URL: urlWithProtocol(/^rediss?$/, 'redis://host:6379'),

    JWT_ACCESS_SECRET: secret,
    JWT_REFRESH_SECRET: secret,

    S3_ENDPOINT: urlWithProtocol(/^https?$/, 'http(s)://host:port'),
    S3_BUCKET: z
      .string()
      .regex(
        /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/,
        'nama bucket S3 tidak valid (3-63 karakter huruf kecil, angka, titik, strip)',
      ),
    S3_ACCESS_KEY: z.string().min(1, REQUIRED),
    S3_SECRET_KEY: z.string().min(1, REQUIRED),

    SMTP_HOST: z.string().min(1, REQUIRED),
    SMTP_PORT: port,
    MAIL_FROM: z.string().min(3, REQUIRED),

    FRONTEND_URL: urlWithProtocol(/^https?$/, 'http(s)://host'),
    // SameSite cookie refresh token. Pakai "none" jika frontend dan API beda
    // site (beda domain); cookie lalu otomatis Secure. "lax" cukup untuk
    // localhost:5173 -> localhost:3000 (port tidak membuat beda site).
    AUTH_COOKIE_SAMESITE: z
      .enum(['lax', 'strict', 'none'], {
        error: 'harus salah satu dari lax, strict, none',
      })
      .default('lax'),
    TZ: z.string().refine(isValidTimeZone, 'zona waktu IANA tidak dikenal'),
  })
  .refine((env) => env.JWT_ACCESS_SECRET !== env.JWT_REFRESH_SECRET, {
    path: ['JWT_REFRESH_SECRET'],
    message: 'harus berbeda dari JWT_ACCESS_SECRET',
  });

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(problems: string[]) {
    super(
      [
        `Konfigurasi environment tidak valid (${problems.length} masalah):`,
        ...problems.map((problem) => `  - ${problem}`),
        'Lengkapi variabel di atas (lihat backend/.env.example) lalu jalankan ulang.',
      ].join('\n'),
    );
    this.name = 'EnvValidationError';
    // Stack trace tidak membantu di sini; log startup cukup berisi daftar env.
    this.stack = `${this.name}: ${this.message}`;
  }
}

/**
 * Dipakai ConfigModule saat startup. Melempar EnvValidationError yang
 * mendaftar semua variabel bermasalah sekaligus, bukan satu per satu.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (result.success) {
    return result.data;
  }

  const problems = result.error.issues.map((issue) => {
    const key = issue.path.join('.');
    const raw = config[key];
    const missing = raw === undefined || raw === '';
    return `${key}: ${missing ? REQUIRED : issue.message}`;
  });
  throw new EnvValidationError([...new Set(problems)]);
}
