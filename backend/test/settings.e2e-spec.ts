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

/**
 * Wiring modul pengaturan di aplikasi utuh: role per endpoint (GET hari libur
 * dan kontak untuk semua role), ValidationPipe, interceptor audit, Swagger.
 * Database di-mock; aturan bisnis diuji di unit test.
 */
describe('Settings (e2e)', () => {
  let app: NestExpressApplication;
  let employeeToken: string;
  let hrToken: string;

  const HR_USER = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e99';
  const HOLIDAY = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e20';
  const at = new Date('2026-11-25T01:00:00.000Z');
  const hrContact = {
    email: 'hr@bluerose.test',
    whatsapp: '6281200000000',
    hours: 'Senin-Jumat 08:30-17:30 WIB',
  };

  const findManyHolidays = jest.fn<(args: unknown) => Promise<unknown>>();
  const findUniqueSetting = jest.fn<(args: unknown) => Promise<unknown>>();
  const upsertSetting = jest.fn<(args: unknown) => Promise<unknown>>();
  const createShift = jest.fn<(args: unknown) => Promise<unknown>>();
  const createAuditLog = jest.fn<(args: unknown) => Promise<unknown>>();

  beforeAll(async () => {
    const client = {
      $connect: jest.fn(),
      $disconnect: jest.fn(),
      holiday: { findMany: findManyHolidays },
      companySetting: { findUnique: findUniqueSetting, upsert: upsertSetting },
      shift: { create: createShift, findFirst: jest.fn() },
      auditLog: { create: createAuditLog },
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(client),
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
      sub: HR_USER,
      role: 'HR',
      employeeId: null,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    findManyHolidays.mockReset().mockResolvedValue([
      {
        id: HOLIDAY,
        date: new Date('2026-08-17T00:00:00.000Z'),
        name: 'Hari Kemerdekaan Republik Indonesia',
        createdAt: at,
        updatedAt: at,
      },
    ]);
    findUniqueSetting
      .mockReset()
      .mockResolvedValue({ value: hrContact, updatedAt: at });
    upsertSetting.mockReset();
    createShift.mockReset();
    createAuditLog.mockReset().mockResolvedValue({});
  });

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  it.each([
    ['get', '/api/v1/office-locations'],
    ['post', '/api/v1/office-locations'],
    ['delete', `/api/v1/office-locations/${IDS.officeLocation}`],
    ['get', '/api/v1/shifts'],
    ['patch', `/api/v1/shifts/${IDS.shift}`],
    ['post', '/api/v1/holidays'],
    ['delete', `/api/v1/holidays/${HOLIDAY}`],
    ['put', '/api/v1/settings/hr-contact'],
    ['put', '/api/v1/settings/admin-contact'],
  ] as const)(
    'karyawan tidak bisa mengubah pengaturan: %s %s -> 403',
    async (method, path) => {
      const res = await http()[method](path).set(as(employeeToken)).expect(403);

      expect(res.body.message).toBe('Anda tidak punya akses ke fitur ini');
    },
  );

  it('karyawan bisa melihat hari libur per tahun', async () => {
    const res = await http()
      .get('/api/v1/holidays?year=2026')
      .set(as(employeeToken))
      .expect(200);

    expect(res.body).toEqual([
      {
        id: HOLIDAY,
        date: '2026-08-17',
        name: 'Hari Kemerdekaan Republik Indonesia',
        createdAt: at.toISOString(),
        updatedAt: at.toISOString(),
      },
    ]);
  });

  it('karyawan bisa melihat kontak HR', async () => {
    const res = await http()
      .get('/api/v1/settings/hr-contact')
      .set(as(employeeToken))
      .expect(200);

    expect(res.body).toEqual({ ...hrContact, updatedAt: at.toISOString() });
  });

  it('tanpa login: 401', async () => {
    await http().get('/api/v1/holidays').expect(401);
  });

  it('year bukan angka ditolak 400', async () => {
    const res = await http()
      .get('/api/v1/holidays?year=abc')
      .set(as(employeeToken))
      .expect(400);

    expect(res.body.message).toContain('year harus bilangan bulat');
  });

  it('HR: radius 10 meter ditolak 400 sebelum menyentuh database', async () => {
    const res = await http()
      .post('/api/v1/office-locations')
      .set(as(hrToken))
      .send({ name: 'Cabang', latitude: -6.2, longitude: 106.8, radiusM: 10 })
      .expect(400);

    expect(res.body.message).toEqual(['radiusM minimal 25 meter']);
  });

  it('HR: shift dengan jam pulang sebelum jam masuk ditolak 400', async () => {
    const res = await http()
      .post('/api/v1/shifts')
      .set(as(hrToken))
      .send({ name: 'Malam', startTime: '22:00', endTime: '06:00' })
      .expect(400);

    expect(res.body.message).toBe(
      'Jam pulang harus setelah jam masuk (shift lintas tengah malam belum didukung)',
    );
    expect(createShift).not.toHaveBeenCalled();
  });

  it('HR: PUT kontak HR menyimpan dan mencatat audit dengan actor', async () => {
    upsertSetting.mockResolvedValue({
      value: { ...hrContact, whatsapp: '6281299998888' },
      updatedAt: at,
    });

    await http()
      .put('/api/v1/settings/hr-contact')
      .set(as(hrToken))
      .send({ ...hrContact, whatsapp: '6281299998888' })
      .expect(200);

    expect(createAuditLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: HR_USER,
        action: 'company_setting.update',
        entity: 'CompanySetting',
        entityId: 'hr_contact',
        before: { whatsapp: '6281200000000' },
        after: { whatsapp: '6281299998888' },
      }),
    });
  });

  it('HR: nomor WhatsApp berawalan 0 ditolak 400', async () => {
    const res = await http()
      .put('/api/v1/settings/admin-contact')
      .set(as(hrToken))
      .send({ ...hrContact, whatsapp: '081200000000' })
      .expect(400);

    expect(res.body.message[0]).toMatch(/^Nomor WhatsApp harus berformat 62/);
    expect(upsertSetting).not.toHaveBeenCalled();
  });

  it('Swagger mendokumentasikan endpoint pengaturan', async () => {
    const res = await http().get('/docs-json').expect(200);
    const paths = Object.keys((res.body as { paths: object }).paths);

    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/v1/office-locations',
        '/api/v1/office-locations/{id}',
        '/api/v1/shifts',
        '/api/v1/shifts/{id}',
        '/api/v1/holidays',
        '/api/v1/holidays/{id}',
        '/api/v1/settings/hr-contact',
        '/api/v1/settings/admin-contact',
      ]),
    );
  });
});
