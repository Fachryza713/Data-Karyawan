import { jest } from '@jest/globals';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Clock } from '../src/common/time/clock.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../src/redis/redis.module.js';
import { IDS } from './fixtures/employees.js';
import { withFakeQueues } from './fixtures/queue.js';

/**
 * Wiring modul absensi di aplikasi utuh: role per controller, ValidationPipe
 * (client tidak bisa mengirim jarak/waktu), 422 dengan details, CSV ekspor,
 * Swagger. Database di-mock; aturan bisnis diuji di unit test.
 */
describe('Attendance (e2e)', () => {
  let app: NestExpressApplication;
  let employeeToken: string;
  let hrToken: string;

  // Kamis 26 Nov 2026 08:27 WIB.
  const NOW = new Date('2026-11-26T01:27:00.000Z');

  const findUniqueEmployee = jest.fn<(args: unknown) => Promise<unknown>>();
  const findUniqueAttendance = jest.fn<(args: unknown) => Promise<unknown>>();
  const createAttendance = jest.fn<(args: unknown) => Promise<unknown>>();
  const findManyAttendances = jest.fn<(args: unknown) => Promise<unknown>>();

  beforeAll(async () => {
    const client = {
      $connect: jest.fn(),
      $disconnect: jest.fn(),
      employee: { findUnique: findUniqueEmployee },
      holiday: { findUnique: jest.fn(() => Promise.resolve(null)) },
      // ApprovedRemoteWorkPolicy: tidak ada izin WFH/dinas yang disetujui.
      leaveRequest: { findFirst: jest.fn(() => Promise.resolve(null)) },
      attendance: {
        findUnique: findUniqueAttendance,
        create: createAttendance,
        findMany: findManyAttendances,
        count: jest.fn(() => Promise.resolve(0)),
      },
    };
    const moduleRef = await withFakeQueues(
      Test.createTestingModule({ imports: [AppModule] }),
    )
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
      sub: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e99',
      role: 'HR',
      employeeId: null,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    findUniqueEmployee.mockReset().mockResolvedValue({
      id: IDS.employee,
      officeLocation: {
        name: 'Head Office Jakarta',
        latitude: new Prisma.Decimal('-6.224889'),
        longitude: new Prisma.Decimal('106.809889'),
        radiusM: 100,
      },
      shift: { startTime: '08:30', endTime: '17:30', lateToleranceMin: 15 },
    });
    findUniqueAttendance.mockReset().mockResolvedValue(null);
    createAttendance.mockReset().mockImplementation((args) =>
      Promise.resolve({
        id: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e40',
        clockOutAt: null,
        clockOutLat: null,
        clockOutLng: null,
        clockOutDistanceM: null,
        clockOutAccuracyM: null,
        updatedAt: NOW,
        ...(args as { data: object }).data,
      }),
    );
    findManyAttendances.mockReset().mockResolvedValue([]);
  });

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const inOffice = { lat: -6.224901, lng: 106.809912, accuracy: 12 };

  it.each([
    ['get', '/api/v1/attendances', 'employee'],
    ['get', '/api/v1/attendances/summary', 'employee'],
    ['get', '/api/v1/attendances/export', 'employee'],
    ['post', '/api/v1/attendances/me/clock-in', 'hr'],
    ['get', '/api/v1/attendances/me/today', 'hr'],
  ] as const)('%s %s sebagai %s -> 403', async (method, path, who) => {
    await http()
      [method](path)
      .set(as(who === 'hr' ? hrToken : employeeToken))
      .expect(403);
  });

  it('clock-in: waktu dan jarak dari server, ON_TIME 08:27', async () => {
    const res = await http()
      .post('/api/v1/attendances/me/clock-in')
      .set(as(employeeToken))
      .send(inOffice)
      .expect(201);

    expect(res.body).toMatchObject({
      date: '2026-11-26',
      status: 'ON_TIME',
      mode: 'OFFICE',
      clockIn: { time: '08:27', distanceM: 3, accuracyM: 12 },
    });
    expect(findUniqueEmployee).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: IDS.user } }),
    );
  });

  it('clock-in: client tidak bisa mengirim jarak, waktu, atau mode (400)', async () => {
    const res = await http()
      .post('/api/v1/attendances/me/clock-in')
      .set(as(employeeToken))
      .send({ ...inOffice, distanceM: 0, clockInAt: NOW, mode: 'WFH' })
      .expect(400);

    expect(res.body.message).toEqual(
      expect.arrayContaining([
        'property distanceM should not exist',
        'property mode should not exist',
      ]),
    );
    expect(createAttendance).not.toHaveBeenCalled();
  });

  it('clock-in: akurasi 150 m -> 422 dengan details', async () => {
    const res = await http()
      .post('/api/v1/attendances/me/clock-in')
      .set(as(employeeToken))
      .send({ ...inOffice, accuracy: 150 })
      .expect(422);

    expect(res.body.details).toEqual({ accuracyM: 150, maxAccuracyM: 100 });
  });

  it('clock-in: di luar radius -> 422 dengan { distanceM, radiusM }', async () => {
    const res = await http()
      .post('/api/v1/attendances/me/clock-in')
      .set(as(employeeToken))
      // Sekitar 1,1 km di utara kantor.
      .send({ ...inOffice, lat: -6.214889 })
      .expect(422);

    expect(res.body.details).toEqual({ distanceM: 1112, radiusM: 100 });
    expect(createAttendance).not.toHaveBeenCalled();
  });

  it('clock-in ganda (unique constraint) -> 409', async () => {
    createAttendance.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: Prisma.prismaVersion.client,
      }),
    );

    const res = await http()
      .post('/api/v1/attendances/me/clock-in')
      .set(as(employeeToken))
      .send(inOffice)
      .expect(409);

    expect(res.body.message).toBe('Anda sudah absen masuk hari ini');
  });

  it('HR: ekspor CSV di-stream dengan header file', async () => {
    const res = await http()
      .get('/api/v1/attendances/export?from=2026-11-01&to=2026-11-30')
      .set(as(hrToken))
      .expect(200);

    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="absensi_2026-11-01_2026-11-30.csv"',
    );
    expect(
      res.text.startsWith(`${String.fromCharCode(0xfeff)}Tanggal,NIP,Nama,`),
    ).toBe(true);
  });

  it('HR: filter ekspor salah -> 400 JSON (sebelum stream dimulai)', async () => {
    const res = await http()
      .get('/api/v1/attendances/export?from=2026-11-01')
      .set(as(hrToken))
      .expect(400);

    expect(res.body.message).toBe('from dan to harus diisi bersama');
  });

  it('Swagger mendokumentasikan endpoint absensi', async () => {
    const res = await http().get('/docs-json').expect(200);
    const paths = Object.keys((res.body as { paths: object }).paths);

    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/v1/attendances/me/clock-in',
        '/api/v1/attendances/me/clock-out',
        '/api/v1/attendances/me/today',
        '/api/v1/attendances/me',
        '/api/v1/attendances',
        '/api/v1/attendances/summary',
        '/api/v1/attendances/export',
      ]),
    );
  });
});
