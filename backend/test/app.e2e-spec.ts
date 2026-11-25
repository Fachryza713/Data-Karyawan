import { jest } from '@jest/globals';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../src/redis/redis.module.js';

describe('Fondasi aplikasi (e2e)', () => {
  let app: NestExpressApplication;
  const queryRaw = jest.fn<() => Promise<unknown>>();
  const ping = jest.fn<() => Promise<string>>();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: queryRaw,
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      })
      .overrideProvider(REDIS_CLIENT)
      .useValue({ ping, status: 'end', disconnect: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    queryRaw.mockReset().mockResolvedValue([{ ok: 1 }]);
    ping.mockReset().mockResolvedValue('PONG');
  });

  const http = () => request(app.getHttpServer());

  it('GET /health 200 saat semua dependensi sehat (tanpa prefix /api/v1)', async () => {
    const res = await http().get('/health').expect(200);

    expect(res.body).toMatchObject({
      status: 'ok',
      info: { database: { status: 'up' }, redis: { status: 'up' } },
    });
  });

  it('GET /health 503 berformat error seragam saat Redis mati', async () => {
    ping.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const res = await http().get('/health').expect(503);

    expect(res.body).toEqual({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'Dependensi tidak sehat: redis',
      path: '/health',
      timestamp: expect.any(String) as unknown,
      requestId: res.headers['x-request-id'],
    });
  });

  it('route tak dikenal di /api/v1 menjadi 404 berformat seragam', async () => {
    const res = await http().get('/api/v1/tidak-ada').expect(404);

    expect(res.body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      path: '/api/v1/tidak-ada',
    });
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('memakai X-Request-Id dari klien jika formatnya aman', async () => {
    const res = await http()
      .get('/api/v1/tidak-ada')
      .set('X-Request-Id', 'trace-123')
      .expect(404);

    expect(res.headers['x-request-id']).toBe('trace-123');
    expect(res.body.requestId).toBe('trace-123');
  });

  it('JSON rusak menjadi 400 berformat seragam', async () => {
    const res = await http()
      .post('/api/v1/apa-saja')
      .set('Content-Type', 'application/json')
      .send('{"rusak":')
      .expect(400);

    expect(res.body).toMatchObject({ statusCode: 400, error: 'Bad Request' });
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('memasang header keamanan helmet', async () => {
    const res = await http().get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('CORS dengan credentials hanya untuk FRONTEND_URL', async () => {
    const allowed = await http()
      .options('/api/v1/apa-saja')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');

    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await http()
      .options('/api/v1/apa-saja')
      .set('Origin', 'https://jahat.example')
      .set('Access-Control-Request-Method', 'POST');

    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('Swagger UI di /docs dan dokumen JSON dengan bearer auth', async () => {
    await http().get('/docs').expect(200).expect('Content-Type', /html/);

    const res = await http().get('/docs-json').expect(200);
    const doc = res.body as {
      paths: Record<string, unknown>;
      components: { securitySchemes: Record<string, { scheme?: string }> };
    };

    expect(doc.paths['/health']).toBeDefined();
    expect(doc.components.securitySchemes.bearer?.scheme).toBe('bearer');
  });
});
