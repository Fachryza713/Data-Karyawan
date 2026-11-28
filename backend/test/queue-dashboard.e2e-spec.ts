import { jest } from '@jest/globals';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { withFakeQueues } from './fixtures/queue.js';

const USER = 'admin';
const PASSWORD = 'rahasia-dashboard-test';

/**
 * Bull Board /admin/queues dengan ENABLE_QUEUE_DASHBOARD=true. Env diisi
 * sebelum AppModule dimuat (ConfigModule memvalidasi env saat modul dibuat),
 * jadi AppModule diimpor dinamis di beforeAll.
 */
describe('Bull Board (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    Object.assign(process.env, {
      ENABLE_QUEUE_DASHBOARD: 'true',
      QUEUE_DASHBOARD_USER: USER,
      QUEUE_DASHBOARD_PASSWORD: PASSWORD,
    });
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const { REDIS_CLIENT } = await import('../src/redis/redis.module.js');

    const moduleRef = await withFakeQueues(
      Test.createTestingModule({ imports: [AppModule] }),
    )
      .overrideProvider(PrismaService)
      .useValue({ client: { $connect: jest.fn(), $disconnect: jest.fn() } })
      .overrideProvider(REDIS_CLIENT)
      .useValue({ ping: jest.fn(), status: 'end', disconnect: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const basic = (user: string, password: string) =>
    `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

  it('tanpa login: 401 dengan WWW-Authenticate (termasuk API dan file statis)', async () => {
    for (const path of [
      '/admin/queues',
      '/admin/queues/api/queues',
      '/admin/queues/static/favicon-32x32.png',
    ]) {
      const res = await http().get(path).expect(401);
      expect(res.headers['www-authenticate']).toMatch(/^Basic realm=/);
    }
  });

  it('password salah: 401', async () => {
    await http()
      .get('/admin/queues')
      .set('Authorization', basic(USER, 'salah'))
      .expect(401);
  });

  it('login benar: halaman Bull Board, di luar prefix /api/v1', async () => {
    const res = await http()
      .get('/admin/queues')
      .set('Authorization', basic(USER, PASSWORD))
      .expect(200);

    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<base href="/admin/queues/"');
    // Tidak ikut prefix /api/v1.
    await http()
      .get('/api/v1/admin/queues')
      .set('Authorization', basic(USER, PASSWORD))
      .expect(404);
  });
});
