import { jest } from '@jest/globals';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../src/redis/redis.module.js';
import { IDS } from './fixtures/employees.js';
import { withFakeQueues } from './fixtures/queue.js';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * KPI hanya untuk HR (PRD 6.5): semua endpoint KPI yang terdaftar di
 * Swagger dicoba dengan token karyawan dan harus 403, tanpa menyentuh
 * database. Database di-mock; aturan bisnis diuji di unit test.
 */
describe('KPI (e2e)', () => {
  let app: NestExpressApplication;
  let employeeToken: string;
  let hrToken: string;
  let kpiRoutes: { method: Method; path: string }[];

  const ID = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9f01';
  const findManyPeriods = jest.fn<(args: unknown) => Promise<unknown>>();
  const createTemplate = jest.fn<(args: unknown) => Promise<unknown>>();
  // Setiap query KPI yang tidak diharapkan tercatat di sini.
  const kpiTouched = jest.fn();

  const model = (overrides: Record<string, unknown> = {}) =>
    new Proxy(overrides, {
      get: (target, key: string) =>
        target[key] ??
        ((...args: unknown[]) => {
          kpiTouched(key, ...args);
          return Promise.resolve(null);
        }),
    });

  beforeAll(async () => {
    const client = {
      $connect: jest.fn(),
      $disconnect: jest.fn(),
      kpiPeriod: model({ findMany: findManyPeriods }),
      kpiTemplate: model({ create: createTemplate }),
      kpiReview: model(),
      kpiScore: model(),
      kpiIndicator: model(),
      $transaction: (...args: unknown[]) => {
        kpiTouched(...args);
        return Promise.resolve(null);
      },
    };
    const moduleRef = await withFakeQueues(
      Test.createTestingModule({ imports: [AppModule] }),
    )
      .overrideProvider(PrismaService)
      .useValue({ client })
      .overrideProvider(REDIS_CLIENT)
      .useValue({ ping: jest.fn(), status: 'end', disconnect: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();

    const jwt = app.get(JwtService, { strict: false });
    employeeToken = await jwt.signAsync({
      sub: IDS.user,
      role: 'EMPLOYEE',
      employeeId: IDS.employee,
    });
    hrToken = await jwt.signAsync({
      sub: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e99',
      role: 'HR',
      employeeId: null,
    });

    const docs = await request(app.getHttpServer()).get('/docs-json');
    const paths = (
      docs.body as { paths: Record<string, Record<string, unknown>> }
    ).paths;
    kpiRoutes = Object.entries(paths)
      .filter(([path]) => /^\/api\/v1\/kpi-/.test(path))
      .flatMap(([path, operations]) =>
        Object.keys(operations).map((method) => ({
          method: method as Method,
          path: path.replace(/\{[^}]+\}/g, ID),
        })),
      );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    kpiTouched.mockReset();
    findManyPeriods.mockReset().mockResolvedValue([]);
    createTemplate.mockReset();
  });

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('Swagger mendokumentasikan semua endpoint KPI', () => {
    expect(
      kpiRoutes
        .map((r) => `${r.method.toUpperCase()} ${r.path.replaceAll(ID, ':id')}`)
        .sort(),
    ).toEqual(
      [
        'GET /api/v1/kpi-templates',
        'POST /api/v1/kpi-templates',
        'POST /api/v1/kpi-templates/copy',
        'GET /api/v1/kpi-templates/:id',
        'PATCH /api/v1/kpi-templates/:id',
        'POST /api/v1/kpi-templates/:id/indicators',
        'PATCH /api/v1/kpi-templates/:id/indicators/:id',
        'DELETE /api/v1/kpi-templates/:id/indicators/:id',
        'GET /api/v1/kpi-periods',
        'POST /api/v1/kpi-periods',
        'GET /api/v1/kpi-periods/:id',
        'PATCH /api/v1/kpi-periods/:id',
        'POST /api/v1/kpi-periods/:id/activate',
        'POST /api/v1/kpi-periods/:id/close',
        'GET /api/v1/kpi-periods/:id/progress',
        'GET /api/v1/kpi-reviews',
        'GET /api/v1/kpi-reviews/:id',
        'PUT /api/v1/kpi-reviews/:id/scores',
        'POST /api/v1/kpi-reviews/:id/finalize',
      ].sort(),
    );
  });

  it('karyawan mendapat 403 di SEMUA endpoint KPI, tanpa query database', async () => {
    expect(kpiRoutes.length).toBeGreaterThanOrEqual(19);
    for (const { method, path } of kpiRoutes) {
      const res = await http()[method](path).set(as(employeeToken)).send({});
      expect({ route: `${method} ${path}`, status: res.status }).toEqual({
        route: `${method} ${path}`,
        status: 403,
      });
    }
    expect(kpiTouched).not.toHaveBeenCalled();
    expect(findManyPeriods).not.toHaveBeenCalled();
  });

  it('tanpa token: 401 di semua endpoint KPI', async () => {
    for (const { method, path } of kpiRoutes) {
      await http()[method](path).expect(401);
    }
  });

  it('tidak ada endpoint KPI untuk karyawan (/me)', () => {
    expect(kpiRoutes.some((route) => route.path.includes('/me'))).toBe(false);
  });

  it('HR lolos guard', async () => {
    await http().get('/api/v1/kpi-periods').set(as(hrToken)).expect(200);
    expect(findManyPeriods).toHaveBeenCalledTimes(1);
  });

  it('bobot sebagai angka JSON atau > 100 ditolak 400 sebelum menyentuh database', async () => {
    const res = await http()
      .post('/api/v1/kpi-templates')
      .set(as(hrToken))
      .send({
        positionId: IDS.position,
        name: 'KPI Frontend',
        indicators: [
          { name: 'Kualitas', weight: 33.33 },
          { name: 'Kecepatan', weight: '100.01' },
        ],
      })
      .expect(400);

    expect(res.body.message).toEqual(
      expect.arrayContaining([
        expect.stringContaining('weight harus berupa teks'),
        expect.stringContaining('weight harus angka 0-100'),
      ]),
    );
    expect(createTemplate).not.toHaveBeenCalled();
  });

  it('skor di luar 0-100 atau lebih dari 2 desimal ditolak 400', async () => {
    const res = await http()
      .put(`/api/v1/kpi-reviews/${ID}/scores`)
      .set(as(hrToken))
      .send({
        scores: [
          { indicatorId: ID, score: '101' },
          { indicatorId: ID, score: '87.555' },
        ],
      })
      .expect(400);

    expect(res.body.message).toHaveLength(2);
    expect(kpiTouched).not.toHaveBeenCalled();
  });
});
