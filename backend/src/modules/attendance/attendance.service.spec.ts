import { jest } from '@jest/globals';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type QueryArgs, queryMock } from '../../../test/fixtures/employees.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { HolidayService } from '../settings/holiday.service.js';
import { AttendanceMessages } from './attendance.constants.js';
import type { AttendanceRow } from './attendance.mapper.js';
import { AttendanceService } from './attendance.service.js';
import type { GeoService } from './geo.service.js';
import type {
  ApprovedRemoteWork,
  RemoteWorkPolicy,
} from './remote-work.policy.js';

const USER = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e11';
const EMPLOYEE = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e10';
const ATTENDANCE = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e40';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

const employee = {
  id: EMPLOYEE,
  officeLocation: {
    name: 'Head Office Jakarta',
    latitude: new Prisma.Decimal('-6.224889'),
    longitude: new Prisma.Decimal('106.809889'),
    radiusM: 100,
  },
  shift: { startTime: '08:30', endTime: '17:30', lateToleranceMin: 15 },
};

const inOffice = { lat: -6.224901, lng: 106.809912, accuracy: 12.34 };

function knownError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('prisma error', {
    code,
    clientVersion: Prisma.prismaVersion.client,
  });
}

/** Baris tersimpan setelah absen masuk 08:27 WIB. */
function clockedInRow(overrides: Partial<AttendanceRow> = {}): AttendanceRow {
  return {
    id: ATTENDANCE,
    date: day('2026-11-26'),
    status: 'ON_TIME',
    mode: 'OFFICE',
    lateMinutes: 0,
    clockInAt: new Date('2026-11-26T01:27:00.000Z'),
    clockInLat: new Prisma.Decimal('-6.224901'),
    clockInLng: new Prisma.Decimal('106.809912'),
    clockInDistanceM: 3,
    clockInAccuracyM: new Prisma.Decimal('12.3'),
    clockOutAt: null,
    clockOutLat: null,
    clockOutLng: null,
    clockOutDistanceM: null,
    clockOutAccuracyM: null,
    updatedAt: new Date('2026-11-26T01:27:00.000Z'),
    ...overrides,
  };
}

/** Echo data create/update menjadi baris lengkap seperti yang dikembalikan Prisma. */
function echoRow(args: QueryArgs, base: Partial<AttendanceRow> = {}) {
  return Promise.resolve({
    ...clockedInRow({
      clockInAt: null,
      clockInLat: null,
      clockInLng: null,
      clockInDistanceM: null,
      clockInAccuracyM: null,
      ...base,
    }),
    ...args.data,
  });
}

function setup(nowIso = '2026-11-26T01:27:00.000Z') {
  const client = {
    employee: { findUnique: queryMock().mockResolvedValue(employee) },
    attendance: {
      findUnique: queryMock().mockResolvedValue(null),
      findMany: queryMock().mockResolvedValue([]),
      create: queryMock().mockImplementation((args) => echoRow(args)),
      update: queryMock().mockImplementation((args) =>
        echoRow(args, clockedInRow()),
      ),
    },
  };
  const holidays = {
    isWorkingDay: jest
      .fn<HolidayService['isWorkingDay']>()
      .mockResolvedValue(true),
    workingDaysBetween: jest
      .fn<HolidayService['workingDaysBetween']>()
      .mockResolvedValue(21),
  };
  const geo = {
    haversineMeters: jest.fn<GeoService['haversineMeters']>(() => 3.2),
  };
  const clock = { now: jest.fn(() => new Date(nowIso)) };
  const remoteWork = {
    hasApprovedRemote: jest
      .fn<RemoteWorkPolicy['hasApprovedRemote']>()
      .mockResolvedValue(null),
  };
  const service = new AttendanceService(
    { client } as unknown as PrismaService,
    holidays as unknown as HolidayService,
    geo,
    clock,
    remoteWork,
  );
  return { service, client, holidays, geo, clock, remoteWork };
}

const firstArgs = (mock: { mock: { calls: QueryArgs[][] } }) =>
  mock.mock.calls[0][0];

async function rejection(promise: Promise<unknown>) {
  const error = await promise.catch((e: unknown) => e);
  if (!(error instanceof Error)) throw new Error('Promise tidak ditolak');
  return error as Error & {
    getResponse?: () => unknown;
    getStatus?: () => number;
  };
}

describe('AttendanceService.clockIn', () => {
  it('di dalam radius, sebelum toleransi: ON_TIME, mode OFFICE, koordinat dan jarak dari server', async () => {
    const { service, client, geo } = setup('2026-11-26T01:27:00.000Z'); // 08:27 WIB

    const result = await service.clockIn(USER, inOffice);

    // Karyawan dicari dari akun di JWT, bukan dari parameter.
    expect(firstArgs(client.employee.findUnique).where).toEqual({
      userId: USER,
    });
    expect(geo.haversineMeters).toHaveBeenCalledWith(
      { lat: -6.224901, lng: 106.809912 },
      { lat: -6.224889, lng: 106.809889 },
    );
    const data = firstArgs(client.attendance.create).data as Record<
      string,
      unknown
    >;
    expect(data).toMatchObject({
      employeeId: EMPLOYEE,
      date: day('2026-11-26'),
      clockInAt: new Date('2026-11-26T01:27:00.000Z'),
      clockInDistanceM: 3,
      mode: 'OFFICE',
      status: 'ON_TIME',
      lateMinutes: 0,
    });
    expect(String(data.clockInAccuracyM)).toBe('12.3');
    expect(String(data.clockInLat)).toBe('-6.224901');
    expect(result).toMatchObject({
      date: '2026-11-26',
      status: 'ON_TIME',
      clockIn: { time: '08:27', distanceM: 3, accuracyM: 12.3 },
      clockOut: null,
    });
  });

  it('masuk 08:52 WIB (lewat toleransi 15 menit): LATE 22 menit', async () => {
    const { service, client } = setup('2026-11-26T01:52:00.000Z');

    await service.clockIn(USER, inOffice);

    expect(firstArgs(client.attendance.create).data).toMatchObject({
      status: 'LATE',
      lateMinutes: 22,
    });
  });

  it('batas tanggal WIB: 23:30 UTC tanggal 26 = tanggal 27 WIB', async () => {
    // 2026-11-26T23:30Z = Jumat 27 Nov 06:30 WIB.
    const { service, client, holidays } = setup('2026-11-26T23:30:00.000Z');

    const result = await service.clockIn(USER, inOffice);

    expect(holidays.isWorkingDay).toHaveBeenCalledWith('2026-11-27');
    expect(firstArgs(client.attendance.findUnique).where).toEqual({
      employeeId_date: { employeeId: EMPLOYEE, date: day('2026-11-27') },
    });
    expect(firstArgs(client.attendance.create).data).toMatchObject({
      date: day('2026-11-27'),
      status: 'ON_TIME',
    });
    expect(result.clockIn?.time).toBe('06:30');
  });

  it('akurasi 100 m diterima, 100,1 m ditolak 422 sebelum menyentuh database', async () => {
    const ok = setup();
    await ok.service.clockIn(USER, { ...inOffice, accuracy: 100 });
    expect(ok.client.attendance.create).toHaveBeenCalled();

    const { service, client } = setup();
    const error = await rejection(
      service.clockIn(USER, { ...inOffice, accuracy: 100.1 }),
    );

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse?.()).toMatchObject({
      details: { accuracyM: 100, maxAccuracyM: 100 },
    });
    expect(client.employee.findUnique).not.toHaveBeenCalled();
  });

  it('bukan hari kerja: 422', async () => {
    const { service, holidays, client } = setup();
    holidays.isWorkingDay.mockResolvedValue(false);

    await expect(service.clockIn(USER, inOffice)).rejects.toThrow(
      new UnprocessableEntityException(AttendanceMessages.notWorkingDay),
    );
    expect(client.attendance.create).not.toHaveBeenCalled();
  });

  it('tepat di tepi radius (100,4 m dibulatkan 100 m, radius 100 m): diterima', async () => {
    const { service, client, geo } = setup();
    geo.haversineMeters.mockReturnValue(100.4);

    await service.clockIn(USER, inOffice);

    expect(firstArgs(client.attendance.create).data).toMatchObject({
      clockInDistanceM: 100,
      mode: 'OFFICE',
    });
  });

  it('lewat tepi radius (100,5 m dibulatkan 101 m): 422 dengan distanceM dan radiusM', async () => {
    const { service, client, geo } = setup();
    geo.haversineMeters.mockReturnValue(100.5);

    const error = await rejection(service.clockIn(USER, inOffice));

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse?.()).toMatchObject({
      details: { distanceM: 101, radiusM: 100 },
    });
    expect(client.attendance.create).not.toHaveBeenCalled();
  });

  it('WFH tanpa izin yang disetujui (jauh dari kantor): ditolak 422', async () => {
    const { service, geo, remoteWork } = setup();
    geo.haversineMeters.mockReturnValue(8_250);

    await expect(service.clockIn(USER, inOffice)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(remoteWork.hasApprovedRemote).toHaveBeenCalledWith(
      EMPLOYEE,
      '2026-11-26',
    );
  });

  it.each(['WFH', 'BUSINESS_TRIP'] as const)(
    'izin %s yang disetujui: diterima di luar radius, mode sesuai izin, jarak tetap disimpan',
    async (mode) => {
      const { service, client, geo, remoteWork } = setup();
      geo.haversineMeters.mockReturnValue(8_250.4);
      remoteWork.hasApprovedRemote.mockResolvedValue({
        mode,
      } satisfies ApprovedRemoteWork);

      await service.clockIn(USER, inOffice);

      expect(firstArgs(client.attendance.create).data).toMatchObject({
        mode,
        clockInDistanceM: 8_250,
        status: 'ON_TIME',
      });
    },
  );

  it('sudah absen masuk (dicek sebelum insert): 409 dengan jamnya', async () => {
    const { service, client } = setup();
    client.attendance.findUnique.mockResolvedValue(clockedInRow());

    await expect(service.clockIn(USER, inOffice)).rejects.toThrow(
      new ConflictException('Anda sudah absen masuk hari ini pukul 08:27'),
    );
    expect(client.attendance.create).not.toHaveBeenCalled();
  });

  it('absen ganda bersamaan: unique constraint (P2002) menjadi 409', async () => {
    const { service, client } = setup();
    // Cek awal lolos (request lain belum commit), insert ditolak database.
    client.attendance.create.mockRejectedValue(knownError('P2002'));

    const error = await rejection(service.clockIn(USER, inOffice));

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toBe('Anda sudah absen masuk hari ini');
  });

  it('error database lain tidak disamarkan menjadi 409', async () => {
    const { service, client } = setup();
    client.attendance.create.mockRejectedValue(knownError('P2003'));

    await expect(service.clockIn(USER, inOffice)).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
  });

  it('hari ini sudah tercatat alpa: 409 dengan statusnya', async () => {
    const { service, client } = setup();
    client.attendance.findUnique.mockResolvedValue(
      clockedInRow({
        status: 'ABSENT',
        mode: null,
        clockInAt: null,
        clockInLat: null,
        clockInLng: null,
        clockInDistanceM: null,
        clockInAccuracyM: null,
      }),
    );

    await expect(service.clockIn(USER, inOffice)).rejects.toThrow(
      new ConflictException('Kehadiran hari ini sudah tercatat sebagai Alpa'),
    );
  });

  it('akun tanpa data karyawan: 404', async () => {
    const { service, client } = setup();
    client.employee.findUnique.mockResolvedValue(null);

    await expect(service.clockIn(USER, inOffice)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('AttendanceService.clockOut', () => {
  it('belum absen masuk: 422', async () => {
    const { service, client } = setup('2026-11-26T10:31:00.000Z');

    await expect(service.clockOut(USER, inOffice)).rejects.toThrow(
      new UnprocessableEntityException(AttendanceMessages.notClockedIn),
    );
    expect(client.attendance.update).not.toHaveBeenCalled();
  });

  it('baris alpa (tanpa absen masuk): tetap 422 belum absen masuk', async () => {
    const { service, client } = setup('2026-11-26T10:31:00.000Z');
    client.attendance.findUnique.mockResolvedValue(
      clockedInRow({ status: 'ABSENT', clockInAt: null }),
    );

    await expect(service.clockOut(USER, inOffice)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('pulang 17:31 WIB: status masuk dipertahankan, lokasi pulang disimpan', async () => {
    const { service, client } = setup('2026-11-26T10:31:00.000Z');
    client.attendance.findUnique.mockResolvedValue(
      clockedInRow({ status: 'LATE', lateMinutes: 10 }),
    );

    const result = await service.clockOut(USER, inOffice);

    const args = firstArgs(client.attendance.update);
    // clockOutAt: null di where mencegah dua klik pulang bersamaan.
    expect(args.where).toEqual({ id: ATTENDANCE, clockOutAt: null });
    expect(args.data).toMatchObject({
      clockOutAt: new Date('2026-11-26T10:31:00.000Z'),
      clockOutDistanceM: 3,
      status: 'LATE',
    });
    expect(result.clockOut?.time).toBe('17:31');
  });

  it('pulang 16:00 WIB (sebelum 17:30): EARLY_LEAVE', async () => {
    const { service, client } = setup('2026-11-26T09:00:00.000Z');
    client.attendance.findUnique.mockResolvedValue(clockedInRow());

    await service.clockOut(USER, inOffice);

    expect(firstArgs(client.attendance.update).data).toMatchObject({
      status: 'EARLY_LEAVE',
    });
  });

  it('sudah absen pulang: 409 dengan jamnya', async () => {
    const { service, client } = setup('2026-11-26T11:00:00.000Z');
    client.attendance.findUnique.mockResolvedValue(
      clockedInRow({
        clockOutAt: new Date('2026-11-26T10:35:00.000Z'),
        clockOutLat: new Prisma.Decimal('-6.2249'),
        clockOutLng: new Prisma.Decimal('106.8099'),
        clockOutDistanceM: 4,
        clockOutAccuracyM: new Prisma.Decimal('9'),
      }),
    );

    await expect(service.clockOut(USER, inOffice)).rejects.toThrow(
      new ConflictException('Anda sudah absen pulang hari ini pukul 17:35'),
    );
  });

  it('pulang ganda bersamaan (P2025 dari where clockOutAt: null): 409', async () => {
    const { service, client } = setup('2026-11-26T10:31:00.000Z');
    client.attendance.findUnique.mockResolvedValue(clockedInRow());
    client.attendance.update.mockRejectedValue(knownError('P2025'));

    await expect(service.clockOut(USER, inOffice)).rejects.toThrow(
      new ConflictException(AttendanceMessages.alreadyClockedOut),
    );
  });

  it('pulang di luar radius tanpa izin: 422', async () => {
    const { service, client, geo } = setup('2026-11-26T10:31:00.000Z');
    client.attendance.findUnique.mockResolvedValue(clockedInRow());
    geo.haversineMeters.mockReturnValue(450);

    await expect(service.clockOut(USER, inOffice)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(client.attendance.update).not.toHaveBeenCalled();
  });
});

describe('AttendanceService.today dan myMonth', () => {
  it('today: tanggal WIB, hari kerja, shift, kantor, izin, dan absen hari ini', async () => {
    const { service, client, remoteWork } = setup('2026-11-26T23:30:00.000Z');
    client.attendance.findUnique.mockResolvedValue(null);
    remoteWork.hasApprovedRemote.mockResolvedValue({ mode: 'WFH' });

    await expect(service.today(USER)).resolves.toEqual({
      date: '2026-11-27',
      isWorkingDay: true,
      shift: employee.shift,
      office: { name: 'Head Office Jakarta', radiusM: 100 },
      approvedRemoteMode: 'WFH',
      attendance: null,
    });
  });

  it('myMonth: default bulan ini (WIB), rentang tanggal 1 sampai akhir bulan, ringkasan', async () => {
    const { service, client, holidays } = setup('2026-11-30T18:00:00.000Z'); // 1 Des WIB
    client.attendance.findMany.mockResolvedValue([
      clockedInRow({ status: 'LATE', lateMinutes: 5 }),
      clockedInRow({
        id: 'b',
        status: 'ABSENT',
        mode: null,
        clockInAt: null,
        clockInLat: null,
        clockInLng: null,
        clockInDistanceM: null,
        clockInAccuracyM: null,
      }),
    ]);

    const result = await service.myMonth(USER);

    expect(result.month).toBe('2026-12');
    expect(firstArgs(client.attendance.findMany).where).toEqual({
      employeeId: EMPLOYEE,
      date: { gte: day('2026-12-01'), lte: day('2026-12-31') },
    });
    expect(holidays.workingDaysBetween).toHaveBeenCalledWith(
      '2026-12-01',
      '2026-12-31',
    );
    expect(result.summary).toEqual({
      present: 1,
      late: 1,
      earlyLeave: 0,
      leave: 0,
      sick: 0,
      permit: 0,
      absent: 1,
    });
    expect(result.items).toHaveLength(2);
    expect(result.workingDays).toBe(21);
  });
});
