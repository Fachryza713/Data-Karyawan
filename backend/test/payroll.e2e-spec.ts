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

/**
 * Wiring modul payroll di aplikasi utuh: role per controller, /me dari JWT,
 * ValidationPipe (uang harus teks), ParseUUIDPipe, dan Swagger. Database
 * di-mock; aturan bisnis diuji di unit test dan integration test.
 */
describe('Payroll (e2e)', () => {
  let app: NestExpressApplication;
  let employeeToken: string;
  let hrToken: string;

  const HR_USER = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e99';
  const PERIOD = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e80';

  const findUniqueEmployee = jest.fn<(args: unknown) => Promise<unknown>>();
  const findManyItems = jest.fn<(args: unknown) => Promise<unknown>>();
  const findFirstItem = jest.fn<(args: unknown) => Promise<unknown>>();
  const createSalary = jest.fn<(args: unknown) => Promise<unknown>>();

  beforeAll(async () => {
    const client = {
      $connect: jest.fn(),
      $disconnect: jest.fn(),
      employee: { findUnique: findUniqueEmployee },
      payrollItem: { findMany: findManyItems, findFirst: findFirstItem },
      salaryStructure: { create: createSalary },
      benefit: { findMany: jest.fn(() => Promise.resolve([])) },
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
    findManyItems.mockReset().mockResolvedValue([]);
    findFirstItem.mockReset().mockResolvedValue(null);
    createSalary.mockReset();
  });

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  it.each([
    ['get', `/api/v1/employees/${IDS.employee}/salary-structures`],
    ['post', `/api/v1/employees/${IDS.employee}/salary-structures`],
    ['get', `/api/v1/employees/${IDS.employee}/benefits`],
    ['get', '/api/v1/payroll-configs'],
    ['put', '/api/v1/payroll-configs'],
    ['get', '/api/v1/payroll-periods'],
    ['post', '/api/v1/payroll-periods'],
    ['post', `/api/v1/payroll-periods/${PERIOD}/run`],
    ['post', `/api/v1/payroll-periods/${PERIOD}/finalize`],
    ['get', `/api/v1/payroll-periods/${PERIOD}/employer-contributions`],
    ['patch', `/api/v1/payroll-items/${PERIOD}`],
  ] as const)('%s %s sebagai karyawan -> 403', async (method, path) => {
    await http()[method](path).set(as(employeeToken)).expect(403);
  });

  it.each([
    ['get', '/api/v1/payslips/me'],
    ['get', '/api/v1/benefits/me'],
    ['get', '/api/v1/payroll-periods'],
  ] as const)('%s %s tanpa token -> 401', async (method, path) => {
    await http()[method](path).expect(401);
  });

  it('GET /payslips/me: karyawan dari JWT, hanya periode terbit', async () => {
    await http().get('/api/v1/payslips/me').set(as(employeeToken)).expect(200);

    expect(findUniqueEmployee).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: IDS.user } }),
    );
    expect(findManyItems).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          employeeId: IDS.employee,
          period: { status: { in: ['FINAL', 'PAID'] } },
        },
      }),
    );
  });

  it('GET /payslips/me/:periodId: tidak terbit atau bukan milik sendiri -> 404', async () => {
    const res = await http()
      .get(`/api/v1/payslips/me/${PERIOD}`)
      .set(as(employeeToken))
      .expect(404);

    expect(res.body.message).toMatch(/belum terbit/);
    await http()
      .get('/api/v1/payslips/me/abc')
      .set(as(employeeToken))
      .expect(400);
  });

  it('HR juga punya slip dan manfaat sendiri lewat /me', async () => {
    await http().get('/api/v1/benefits/me').set(as(hrToken)).expect(200);
    expect(findUniqueEmployee).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: HR_USER } }),
    );
  });

  it('uang sebagai angka JSON ditolak 400 sebelum menyentuh database', async () => {
    const res = await http()
      .post(`/api/v1/employees/${IDS.employee}/salary-structures`)
      .set(as(hrToken))
      .send({
        baseSalary: 8500000,
        bankName: 'BCA',
        bankAccountLast4: '8821',
        effectiveFrom: '2026-12-01',
      })
      .expect(400);

    expect(res.body.message).toEqual([
      expect.stringContaining('baseSalary harus nominal rupiah berupa teks'),
    ]);
    expect(createSalary).not.toHaveBeenCalled();
  });

  it('reopen tanpa alasan dan period bukan YYYY-MM -> 400', async () => {
    await http()
      .post(`/api/v1/payroll-periods/${PERIOD}/reopen`)
      .set(as(hrToken))
      .send({})
      .expect(400);
    await http()
      .post('/api/v1/payroll-periods')
      .set(as(hrToken))
      .send({ period: '2026-13' })
      .expect(400);
  });

  it('Swagger mendokumentasikan semua endpoint payroll', async () => {
    const res = await http().get('/docs-json').expect(200);
    const paths = Object.keys((res.body as { paths: object }).paths);

    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/v1/employees/{employeeId}/salary-structures',
        '/api/v1/employees/{employeeId}/benefits',
        '/api/v1/employees/{employeeId}/benefits/{benefitId}',
        '/api/v1/payroll-configs',
        '/api/v1/payroll-periods',
        '/api/v1/payroll-periods/{id}',
        '/api/v1/payroll-periods/{id}/run',
        '/api/v1/payroll-periods/{id}/finalize',
        '/api/v1/payroll-periods/{id}/mark-paid',
        '/api/v1/payroll-periods/{id}/reopen',
        '/api/v1/payroll-periods/{id}/employer-contributions',
        '/api/v1/payroll-items/{id}',
        '/api/v1/payslips/me',
        '/api/v1/payslips/me/{periodId}',
        '/api/v1/benefits/me',
      ]),
    );
  });
});
