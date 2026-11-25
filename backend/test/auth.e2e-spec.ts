import { jest } from '@jest/globals';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../src/redis/redis.module.js';

/**
 * Wiring auth di aplikasi utuh: guard global, @Public, throttler, cookie,
 * dan Swagger. Database dan Redis di-mock; logika service diuji di unit test.
 */
describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  let jwt: JwtService;
  const findUser = jest.fn<(args: unknown) => Promise<unknown>>();
  const findRefreshToken = jest.fn<(args: unknown) => Promise<unknown>>();
  // [totalHits, sisa jendela ms, diblokir, sisa blokir ms]
  const throttleEval = jest.fn<(...args: unknown[]) => Promise<unknown>>();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        client: {
          $connect: jest.fn(),
          $disconnect: jest.fn(),
          user: { findUnique: findUser },
          refreshToken: { findUnique: findRefreshToken },
        },
      })
      .overrideProvider(REDIS_CLIENT)
      .useValue({
        eval: throttleEval,
        ping: jest.fn(),
        status: 'end',
        disconnect: jest.fn(),
      })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    jwt = app.get(JwtService, { strict: false });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    findUser.mockReset().mockResolvedValue(null);
    findRefreshToken.mockReset().mockResolvedValue(null);
    throttleEval.mockReset().mockResolvedValue([1, 60_000, 0, 0]);
  });

  const http = () => request(app.getHttpServer());

  it('endpoint tanpa @Public butuh access token (401 berformat seragam)', async () => {
    const res = await http().get('/api/v1/auth/me').expect(401);

    expect(res.body).toMatchObject({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Access token tidak ada',
      path: '/api/v1/auth/me',
    });
  });

  it('GET /auth/me memakai ID dari JWT', async () => {
    findUser.mockResolvedValue({
      id: 'user-1',
      email: 'hr@bluerose.test',
      role: 'HR',
      isActive: true,
      lastLoginAt: null,
      employee: null,
    });
    const token = await jwt.signAsync({
      sub: 'user-1',
      role: 'HR',
      employeeId: null,
    });

    const res = await http()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(findUser).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' } }),
    );
    expect(res.body).toEqual({
      id: 'user-1',
      email: 'hr@bluerose.test',
      role: 'HR',
      lastLoginAt: null,
      employee: null,
    });
  });

  it('login dengan body tidak valid: 400 dari DTO, setelah dihitung throttler', async () => {
    const res = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'bukan-email', password: '' })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
    expect(throttleEval).toHaveBeenCalledTimes(1);
    // Hanya throttler "login" yang dihitung di endpoint login.
    expect(throttleEval.mock.calls[0][2]).toMatch(/^throttle:login:/);
  });

  it('login diblokir throttler: 429 dengan Retry-After', async () => {
    throttleEval.mockResolvedValue([6, 60_000, 1, 42_000]);

    const res = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'hr@bluerose.test', password: 'apa-saja' })
      .expect(429);

    expect(res.headers['retry-after']).toBe('42');
    expect(res.body).toMatchObject({
      statusCode: 429,
      message: 'Terlalu banyak percobaan. Coba lagi nanti.',
    });
    expect(findUser).not.toHaveBeenCalled();
  });

  it('forgot-password memakai throttler sendiri (3 per jam)', async () => {
    await http()
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'tidak.ada@bluerose.test' })
      .expect(200)
      .expect({
        message: 'Jika email terdaftar, link reset password sudah dikirim.',
      });

    expect(throttleEval).toHaveBeenCalledTimes(1);
    expect(throttleEval.mock.calls[0][2]).toMatch(/^throttle:forgotPassword:/);
    expect(throttleEval.mock.calls[0].slice(4)).toEqual([
      3_600_000, 3, 3_600_000,
    ]);
  });

  it('refresh tanpa cookie: 401 dan cookie dihapus', async () => {
    const res = await http().post('/api/v1/auth/refresh').expect(401);

    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toContain('refresh_token=;');
    expect(setCookie).toContain('Path=/api/v1/auth');
    expect(setCookie).toContain('HttpOnly');
  });

  it('refresh dengan cookie tidak dikenal: 401', async () => {
    await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'refresh_token=tidak-dikenal')
      .expect(401);

    expect(findRefreshToken).toHaveBeenCalledTimes(1);
  });

  it('Swagger mendokumentasikan endpoint auth dan cookie refresh token', async () => {
    const res = await http().get('/docs-json').expect(200);
    const doc = res.body as {
      paths: Record<string, unknown>;
      components: { securitySchemes: Record<string, { in?: string }> };
    };

    for (const path of [
      'login',
      'refresh',
      'logout',
      'logout-all',
      'forgot-password',
      'reset-password',
      'me',
    ]) {
      expect(doc.paths[`/api/v1/auth/${path}`]).toBeDefined();
    }
    expect(doc.components.securitySchemes.refresh_token?.in).toBe('cookie');
  });
});
