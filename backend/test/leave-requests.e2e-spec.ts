import { jest } from '@jest/globals';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Clock } from '../src/common/time/clock.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../src/redis/redis.module.js';
import { IDS } from './fixtures/employees.js';

/**
 * Wiring modul cuti di aplikasi utuh: role per controller, /me memakai ID
 * dari JWT, ValidationPipe, ParseUUIDPipe, urutan route /me vs /:id, dan
 * Swagger. Database di-mock; aturan bisnis diuji di unit test dan
 * integration test (PostgreSQL asli).
 */
describe('Leave requests (e2e)', () => {
  let app: NestExpressApplication;
  let employeeToken: string;
  let hrToken: string;

  const HR_USER = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e99';
  const REQUEST = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e60';
  // Kamis 26 Nov 2026 10:00 WIB.
  const NOW = new Date('2026-11-26T03:00:00.000Z');

  const findUniqueEmployee = jest.fn<(args: unknown) => Promise<unknown>>();
  const findManyRequests = jest.fn<(args: unknown) => Promise<unknown>>();
  const createRequest = jest.fn<(args: unknown) => Promise<unknown>>();

  beforeAll(async () => {
    const client = {
      $connect: jest.fn(),
      $disconnect: jest.fn(),
      employee: { findUnique: findUniqueEmployee },
      leaveRequest: {
        findMany: findManyRequests,
        count: jest.fn(() => Promise.resolve(0)),
        findFirst: jest.fn(() => Promise.resolve(null)),
        create: createRequest,
      },
      leaveType: {
        findMany: jest.fn(() => Promise.resolve([])),
        findUnique: jest.fn(() => Promise.resolve(null)),
      },
      holiday: { findMany: jest.fn(() => Promise.resolve([])) },
      auditLog: { create: jest.fn(() => Promise.resolve({})) },
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(client),
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ client })
      .overrideProvider(REDIS_CLIENT)
      .useValue({ ping: jest.fn(), status: 'end', disconnect: jest.fn() })
      .overrideProvider(Clock)
      .useValue({ now: () => NOW })
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
      sub: HR_USER,
      role: 'HR',
      employeeId: null,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    findUniqueEmployee.mockReset().mockResolvedValue({ id: IDS.employee });
    findManyRequests.mockReset().mockResolvedValue([]);
    createRequest.mockReset();
  });

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  it.each([
    ['get', '/api/v1/leave-requests'],
    ['get', `/api/v1/leave-requests/${REQUEST}`],
    ['post', `/api/v1/leave-requests/${REQUEST}/approve`],
    ['post', `/api/v1/leave-requests/${REQUEST}/reject`],
  ] as const)('%s %s sebagai karyawan -> 403', async (method, path) => {
    await http()[method](path).set(as(employeeToken)).expect(403);
  });

  it.each([
    ['get', '/api/v1/leave-requests/me'],
    ['post', '/api/v1/leave-requests/me'],
    ['get', '/api/v1/leave-balances/me'],
    ['get', '/api/v1/leave-types'],
    ['get', '/api/v1/leave-requests'],
  ] as const)('%s %s tanpa token -> 401', async (method, path) => {
    await http()[method](path).expect(401);
  });

  it('GET /leave-requests/me: tidak tertangkap /:id, karyawan dari JWT', async () => {
    const res = await http()
      .get('/api/v1/leave-requests/me')
      .set(as(employeeToken))
      .expect(200);

    expect(res.body).toEqual({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    expect(findUniqueEmployee).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: IDS.user } }),
    );
    expect(findManyRequests).toHaveBeenCalledWith(
      expect.objectContaining({ where: { employeeId: IDS.employee } }),
    );
  });

  it('HR juga bisa melihat pengajuannya sendiri lewat /me', async () => {
    await http().get('/api/v1/leave-requests/me').set(as(hrToken)).expect(200);
    expect(findUniqueEmployee).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: HR_USER } }),
    );
  });

  it('POST /leave-requests/me: employeeId/status/workingDays dari client ditolak 400', async () => {
    const res = await http()
      .post('/api/v1/leave-requests/me')
      .set(as(employeeToken))
      .send({
        kind: 'WFH',
        startDate: '2026-11-30',
        endDate: '2026-11-30',
        reason: 'Renovasi',
        employeeId: IDS.employee,
        status: 'APPROVED',
        workingDays: 0,
      })
      .expect(400);

    expect(res.body.message).toEqual(
      expect.arrayContaining([
        'property employeeId should not exist',
        'property status should not exist',
        'property workingDays should not exist',
      ]),
    );
    expect(createRequest).not.toHaveBeenCalled();
  });

  it('POST /leave-requests/me: WFH mulai hari ini -> 422 aturan H-1', async () => {
    const res = await http()
      .post('/api/v1/leave-requests/me')
      .set(as(employeeToken))
      .send({
        kind: 'WFH',
        startDate: '2026-11-26',
        endDate: '2026-11-27',
        reason: 'Renovasi',
      })
      .expect(422);

    expect(res.body.message).toMatch(/H-1/);
    expect(createRequest).not.toHaveBeenCalled();
  });

  it('reject tanpa note -> 400; id bukan UUID -> 400', async () => {
    await http()
      .post(`/api/v1/leave-requests/${REQUEST}/reject`)
      .set(as(hrToken))
      .send({})
      .expect(400);
    await http()
      .post('/api/v1/leave-requests/abc/approve')
      .set(as(hrToken))
      .send({})
      .expect(400);
  });

  it('upload-url lampiran: tipe selain JPG/PNG/PDF -> 400', async () => {
    const res = await http()
      .post('/api/v1/leave-requests/me/attachments/upload-url')
      .set(as(employeeToken))
      .send({ contentType: 'image/gif', size: 1000 })
      .expect(400);

    expect(res.body.message).toMatch(/JPG\/PNG\/PDF/);
  });

  it('Swagger mendokumentasikan semua endpoint cuti', async () => {
    const res = await http().get('/docs-json').expect(200);
    const paths = Object.keys((res.body as { paths: object }).paths);

    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/v1/leave-requests/me',
        '/api/v1/leave-requests/me/attachments/upload-url',
        '/api/v1/leave-requests/me/{id}/cancel',
        '/api/v1/leave-requests',
        '/api/v1/leave-requests/{id}',
        '/api/v1/leave-requests/{id}/approve',
        '/api/v1/leave-requests/{id}/reject',
        '/api/v1/leave-balances/me',
        '/api/v1/leave-types',
      ]),
    );
  });
});
