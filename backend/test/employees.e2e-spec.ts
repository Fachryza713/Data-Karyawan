import { jest } from '@jest/globals';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../src/redis/redis.module.js';
import { employeeRow, IDS } from './fixtures/employees.js';

/**
 * Wiring modul karyawan di aplikasi utuh: urutan route /employees/me vs
 * /employees/:id, guard role, ValidationPipe, interceptor audit, Swagger.
 * Database di-mock; aturan bisnis diuji di unit test.
 */
describe('Employees (e2e)', () => {
  let app: NestExpressApplication;
  let employeeToken: string;
  let hrToken: string;

  const findUniqueEmployee = jest.fn<(args: unknown) => Promise<unknown>>();
  const updateEmployee = jest.fn<(args: unknown) => Promise<unknown>>();
  const findManyEmployees = jest.fn<(args: unknown) => Promise<unknown>>();
  const countEmployees = jest.fn<(args: unknown) => Promise<unknown>>();
  const createAuditLog = jest.fn<(args: unknown) => Promise<unknown>>();

  beforeAll(async () => {
    const client = {
      $connect: jest.fn(),
      $disconnect: jest.fn(),
      employee: {
        findUnique: findUniqueEmployee,
        update: updateEmployee,
        findMany: findManyEmployees,
        count: countEmployees,
      },
      auditLog: { create: createAuditLog },
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(client),
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    findUniqueEmployee.mockReset().mockResolvedValue(employeeRow());
    updateEmployee.mockReset().mockImplementation((args) =>
      Promise.resolve({
        ...employeeRow(),
        ...(args as { data: object }).data,
      }),
    );
    findManyEmployees.mockReset().mockResolvedValue([]);
    countEmployees.mockReset().mockResolvedValue(0);
    createAuditLog.mockReset().mockResolvedValue({});
  });

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  it.each([
    ['get', '/api/v1/employees'],
    ['get', `/api/v1/employees/${IDS.employee}`],
    ['post', '/api/v1/employees'],
    ['delete', `/api/v1/employees/${IDS.employee}`],
    ['get', '/api/v1/departments'],
    ['post', '/api/v1/positions'],
  ] as const)(
    'karyawan tidak bisa memanggil endpoint HR: %s %s -> 403',
    async (method, path) => {
      const res = await http()[method](path).set(as(employeeToken)).expect(403);

      expect(res.body.message).toBe('Anda tidak punya akses ke fitur ini');
    },
  );

  it('GET /employees/me tidak tertangkap route /employees/:id (karyawan 200)', async () => {
    const res = await http()
      .get('/api/v1/employees/me')
      .set(as(employeeToken))
      .expect(200);

    expect(findUniqueEmployee).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: IDS.user } }),
    );
    expect(res.body).toMatchObject({
      id: IDS.employee,
      nip: 'BRT-2024-0003',
      photoUrl: null,
    });
    expect(res.body).not.toHaveProperty('photoKey');
  });

  it('PATCH /employees/me menolak departmentId dan role (400)', async () => {
    const res = await http()
      .patch('/api/v1/employees/me')
      .set(as(employeeToken))
      .send({ fullName: 'Raditya', departmentId: IDS.department, role: 'HR' })
      .expect(400);

    expect(res.body.message).toEqual(
      expect.arrayContaining([
        'property departmentId should not exist',
        'property role should not exist',
      ]),
    );
    expect(updateEmployee).not.toHaveBeenCalled();
  });

  it('PATCH /employees/me mengubah data diri dan mencatat audit dengan actor, IP, user agent', async () => {
    await http()
      .patch('/api/v1/employees/me')
      .set(as(employeeToken))
      .set('User-Agent', 'e2e-agent')
      .send({ fullName: 'Raditya P.' })
      .expect(200)
      .expect((res) => {
        expect(res.body.fullName).toBe('Raditya P.');
      });

    expect(createAuditLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: IDS.user,
        action: 'employee.self_update',
        entity: 'Employee',
        entityId: IDS.employee,
        before: { fullName: 'Raditya Pratama' },
        after: { fullName: 'Raditya P.' },
        userAgent: 'e2e-agent',
        ip: expect.any(String),
      }),
    });
  });

  it('upload-url menolak file 3 MB sebelum URL dibuat', async () => {
    const res = await http()
      .post('/api/v1/employees/me/photo/upload-url')
      .set(as(employeeToken))
      .send({ contentType: 'image/png', size: 3 * 1024 * 1024 })
      .expect(400);

    expect(res.body.message).toBe('Ukuran file maksimal 2 MB');
  });

  it('HR: GET /employees?limit=101 ditolak 400', async () => {
    const res = await http()
      .get('/api/v1/employees?limit=101')
      .set(as(hrToken))
      .expect(400);

    expect(res.body.message).toEqual(['limit maksimal 100']);
  });

  it('HR: GET /employees default hanya karyawan aktif, format { data, meta }', async () => {
    const res = await http()
      .get('/api/v1/employees?page=2&limit=5')
      .set(as(hrToken))
      .expect(200);

    expect(res.body).toEqual({
      data: [],
      meta: { page: 2, limit: 5, total: 0, totalPages: 0 },
    });
    expect(findManyEmployees).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
        skip: 5,
        take: 5,
      }),
    );
  });

  it('HR: id bukan UUID ditolak 400', async () => {
    await http()
      .get('/api/v1/employees/bukan-uuid')
      .set(as(hrToken))
      .expect(400);
  });

  it('Swagger mendokumentasikan endpoint karyawan dan master data', async () => {
    const res = await http().get('/docs-json').expect(200);
    const paths = Object.keys((res.body as { paths: object }).paths);

    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/v1/employees',
        '/api/v1/employees/{id}',
        '/api/v1/employees/{id}/restore',
        '/api/v1/employees/me',
        '/api/v1/employees/me/photo/upload-url',
        '/api/v1/employees/me/photo',
        '/api/v1/departments',
        '/api/v1/departments/{id}',
        '/api/v1/positions',
        '/api/v1/positions/{id}',
      ]),
    );
  });
});
