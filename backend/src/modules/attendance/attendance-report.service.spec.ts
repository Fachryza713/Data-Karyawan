import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { type QueryArgs, queryMock } from '../../../test/fixtures/employees.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { HolidayService } from '../settings/holiday.service.js';
import { csvCell, CSV_BOM } from './attendance-csv.js';
import {
  AttendanceReportService,
  buildStatusCounts,
  CSV_HEADER,
  toCsvCells,
} from './attendance-report.service.js';
import {
  AttendanceMessages,
  EXPORT_BATCH_SIZE,
} from './attendance.constants.js';
import type { AttendanceRow } from './attendance.mapper.js';
import type { AttendanceLogItemDto } from './dto/attendance-response.dto.js';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

const employeeRef = (id: string, fullName: string) => ({
  id,
  nip: 'BRT-2024-0003',
  fullName,
  department: { id: 'd1', name: 'Teknologi Informasi' },
  position: { id: 'p1', name: 'Frontend Developer' },
});

const row = (overrides: Partial<AttendanceRow> = {}): AttendanceRow => ({
  id: 'a1',
  date: day('2026-11-26'),
  status: 'LATE',
  mode: 'OFFICE',
  lateMinutes: 12,
  clockInAt: new Date('2026-11-26T01:42:00.000Z'),
  clockInLat: new Prisma.Decimal('-6.224901'),
  clockInLng: new Prisma.Decimal('106.809912'),
  clockInDistanceM: 3,
  clockInAccuracyM: new Prisma.Decimal('12.5'),
  clockOutAt: null,
  clockOutLat: null,
  clockOutLng: null,
  clockOutDistanceM: null,
  clockOutAccuracyM: null,
  updatedAt: new Date('2026-11-26T01:42:00.000Z'),
  ...overrides,
});

function setup() {
  const client = {
    employee: {
      findMany: queryMock().mockResolvedValue([]),
      count: queryMock().mockResolvedValue(0),
    },
    attendance: {
      findMany: queryMock().mockResolvedValue([]),
      count: queryMock().mockResolvedValue(0),
      groupBy: queryMock().mockResolvedValue([]),
    },
  };
  const holidays = {
    isWorkingDay: jest
      .fn<HolidayService['isWorkingDay']>()
      .mockResolvedValue(true),
  };
  const clock = { now: () => new Date('2026-11-26T03:00:00.000Z') };
  const reports = new AttendanceReportService(
    { client } as unknown as PrismaService,
    holidays as unknown as HolidayService,
    clock,
  );
  return { reports, client, holidays };
}

const firstArgs = (mock: { mock: { calls: QueryArgs[][] } }) =>
  mock.mock.calls[0][0];

const page = { page: 1, limit: 20 };

describe('AttendanceReportService.list', () => {
  it('satu tanggal: semua karyawan tampil, yang belum absen berstatus NOT_YET', async () => {
    const { reports, client } = setup();
    client.employee.findMany.mockResolvedValue([
      { ...employeeRef('e1', 'Andika'), attendances: [row()] },
      { ...employeeRef('e2', 'Budi'), attendances: [] },
    ]);
    client.employee.count.mockResolvedValue(2);

    const result = await reports.list({ ...page, date: '2026-11-26' });

    expect(result.meta).toEqual({
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
      from: '2026-11-26',
      to: '2026-11-26',
    });
    expect(result.data.map((item) => item.status)).toEqual(['LATE', 'NOT_YET']);
    expect(result.data[1].attendance).toBeNull();
    expect(result.data[0].attendance?.clockIn?.time).toBe('08:42');
  });

  it('satu tanggal: karyawan nonaktif hanya ikut jika punya catatan, hanya role EMPLOYEE yang sudah mulai bekerja', async () => {
    const { reports, client } = setup();

    await reports.list({ ...page, date: '2026-11-26', departmentId: 'd1' });

    const where = firstArgs(client.employee.findMany).where as Record<
      string,
      unknown
    >;
    // Filter soft delete otomatis dimatikan, aturannya ditulis eksplisit.
    expect(Object.hasOwn(where, 'deletedAt')).toBe(true);
    expect(where).toMatchObject({
      user: { role: 'EMPLOYEE' },
      departmentId: 'd1',
      joinDate: { lte: day('2026-11-26') },
      AND: [
        {
          OR: [
            { deletedAt: null, user: { isActive: true } },
            { attendances: { some: { date: day('2026-11-26') } } },
          ],
        },
      ],
    });
  });

  it('filter NOT_YET: karyawan tanpa baris di tanggal itu', async () => {
    const { reports, client } = setup();

    await reports.list({ ...page, date: '2026-11-26', status: 'NOT_YET' });

    const where = firstArgs(client.employee.findMany).where as {
      AND: unknown[];
    };
    expect(where.AND).toContainEqual({
      attendances: { none: { date: day('2026-11-26') } },
    });
  });

  it('filter status + pencarian nama/NIP pada satu tanggal', async () => {
    const { reports, client } = setup();

    await reports.list({
      ...page,
      date: '2026-11-26',
      status: 'LATE',
      search: 'radit',
    });

    const where = firstArgs(client.employee.findMany).where as {
      AND: unknown[];
      OR: unknown[];
    };
    expect(where.AND).toContainEqual({
      attendances: { some: { date: day('2026-11-26'), status: 'LATE' } },
    });
    expect(where.OR).toEqual([
      { fullName: { contains: 'radit', mode: 'insensitive' } },
      { nip: { contains: 'radit', mode: 'insensitive' } },
    ]);
  });

  it('tanpa date dan from-to: hari ini WIB', async () => {
    const { reports } = setup();

    const result = await reports.list(page);

    expect(result.meta).toMatchObject({ from: '2026-11-26', to: '2026-11-26' });
  });

  it('rentang: hanya baris absensi yang ada, urut tanggal lalu nama', async () => {
    const { reports, client } = setup();
    client.attendance.findMany.mockResolvedValue([
      { ...row(), employee: employeeRef('e1', 'Andika') },
    ]);
    client.attendance.count.mockResolvedValue(1);

    const result = await reports.list({
      ...page,
      from: '2026-11-01',
      to: '2026-11-30',
      status: 'LATE',
    });

    const args = firstArgs(client.attendance.findMany);
    expect(args.where).toEqual({
      date: { gte: day('2026-11-01'), lte: day('2026-11-30') },
      status: 'LATE',
      employee: { user: { role: 'EMPLOYEE' } },
    });
    expect(args.orderBy).toEqual([
      { date: 'asc' },
      { employee: { fullName: 'asc' } },
      { id: 'asc' },
    ]);
    expect(result.data[0]).toMatchObject({
      date: '2026-11-26',
      status: 'LATE',
      employee: { fullName: 'Andika' },
    });
    expect(client.employee.findMany).not.toHaveBeenCalled();
  });

  it.each([
    [
      { date: '2026-11-26', from: '2026-11-01' },
      AttendanceMessages.dateAndRange,
    ],
    [{ from: '2026-11-01' }, AttendanceMessages.incompleteRange],
    [{ from: '2026-11-30', to: '2026-11-01' }, AttendanceMessages.invalidRange],
    [{ from: '2026-01-01', to: '2026-06-30' }, AttendanceMessages.rangeTooLong],
    [
      { from: '2026-11-01', to: '2026-11-30', status: 'NOT_YET' as const },
      AttendanceMessages.notYetNeedsSingleDate,
    ],
  ])('filter tidak valid %o: 400', async (filter, message) => {
    const { reports } = setup();

    await expect(reports.list({ ...page, ...filter })).rejects.toThrow(
      new BadRequestException(message),
    );
  });
});

describe('AttendanceReportService.summary', () => {
  it('jumlah per status; NOT_YET = karyawan tanpa baris', async () => {
    const { reports, client } = setup();
    client.employee.count.mockResolvedValue(29);
    client.attendance.groupBy.mockResolvedValue([
      { status: 'ON_TIME', _count: { _all: 20 } },
      { status: 'LATE', _count: { _all: 3 } },
      { status: 'LEAVE', _count: { _all: 1 } },
    ]);

    const result = await reports.summary('2026-11-26');

    expect(result).toEqual({
      date: '2026-11-26',
      isWorkingDay: true,
      total: 29,
      byStatus: {
        ON_TIME: 20,
        LATE: 3,
        EARLY_LEAVE: 0,
        LEAVE: 1,
        SICK: 0,
        PERMIT: 0,
        ABSENT: 0,
        NOT_YET: 5,
      },
    });
    expect(firstArgs(client.attendance.groupBy).where).toEqual({
      date: day('2026-11-26'),
      employee: {
        user: { role: 'EMPLOYEE' },
        joinDate: { lte: day('2026-11-26') },
      },
    });
  });

  it('buildStatusCounts tidak pernah negatif', () => {
    expect(buildStatusCounts(1, [{ status: 'ABSENT', count: 2 }]).NOT_YET).toBe(
      0,
    );
  });
});

describe('AttendanceReportService.exportCsv', () => {
  const collect = async (lines: AsyncGenerator<string>) => {
    const chunks: string[] = [];
    for await (const line of lines) chunks.push(line);
    return chunks;
  };

  it('filter divalidasi sebelum stream dimulai', () => {
    const { reports } = setup();

    expect(() => reports.exportCsv({ from: '2026-11-01' })).toThrow(
      BadRequestException,
    );
  });

  it('header ber-BOM, lalu baris per batch sampai batch terakhir tidak penuh', async () => {
    const { reports, client } = setup();
    const batch = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        ...row({ id: `a${index}` }),
        employee: employeeRef(`e${index}`, `Karyawan ${index}`),
      }));
    client.attendance.findMany
      .mockResolvedValueOnce(batch(EXPORT_BATCH_SIZE))
      .mockResolvedValueOnce(batch(2));

    const { filename, lines } = reports.exportCsv({
      from: '2026-11-01',
      to: '2026-11-30',
    });
    const chunks = await collect(lines);

    expect(filename).toBe('absensi_2026-11-01_2026-11-30.csv');
    expect(chunks[0]).toBe(`${CSV_BOM}${CSV_HEADER.join(',')}\r\n`);
    expect(chunks).toHaveLength(1 + EXPORT_BATCH_SIZE + 2);
    expect(client.attendance.findMany).toHaveBeenCalledTimes(2);
    expect(client.attendance.findMany.mock.calls[1][0]).toMatchObject({
      skip: EXPORT_BATCH_SIZE,
      take: EXPORT_BATCH_SIZE,
    });
  });

  it('satu tanggal: nama file satu tanggal, karyawan NOT_YET ikut', async () => {
    const { reports, client } = setup();
    client.employee.findMany.mockResolvedValue([
      { ...employeeRef('e2', 'Budi'), attendances: [] },
    ]);

    const { filename, lines } = reports.exportCsv({ date: '2026-11-26' });
    const chunks = await collect(lines);

    expect(filename).toBe('absensi_2026-11-26.csv');
    expect(chunks[1]).toContain('Belum absen');
  });
});

describe('toCsvCells', () => {
  const item = (overrides: Partial<AttendanceLogItemDto> = {}) =>
    ({
      date: '2026-11-26',
      status: 'LATE',
      employee: employeeRef('e1', 'Raditya Pratama'),
      attendance: {
        id: 'a1',
        date: '2026-11-26',
        status: 'LATE',
        mode: 'OFFICE',
        lateMinutes: 12,
        clockIn: {
          at: '2026-11-26T01:42:00.000Z',
          time: '08:42',
          lat: -6.224901,
          lng: 106.809912,
          distanceM: 3,
          accuracyM: 12.5,
        },
        clockOut: null,
        updatedAt: '2026-11-26T01:42:00.000Z',
      },
      ...overrides,
    }) satisfies AttendanceLogItemDto;

  it('kolom sesuai header, label Indonesia, jam WIB, koordinat negatif tetap angka', () => {
    const cells = toCsvCells(item());

    expect(cells).toHaveLength(CSV_HEADER.length);
    expect(cells).toEqual([
      '2026-11-26',
      'BRT-2024-0003',
      'Raditya Pratama',
      'Teknologi Informasi',
      'Frontend Developer',
      'Terlambat',
      'Kantor',
      '08:42',
      '',
      '12',
      '3',
      '12.5',
      '-6.224901',
      '106.809912',
      '',
      '',
      '',
      '',
    ]);
  });

  it('nama yang diawali karakter rumus tidak dieksekusi spreadsheet', () => {
    const cells = toCsvCells(
      item({ employee: employeeRef('e1', '=HYPERLINK("x")') }),
    );

    expect(cells[2]).toBe(`"'=HYPERLINK(""x"")"`);
  });
});

describe('csvCell', () => {
  it.each([
    [null, ''],
    [undefined, ''],
    [12, '12'],
    ['biasa', 'biasa'],
    ['Keuangan, Akuntansi', '"Keuangan, Akuntansi"'],
    ['ada "kutip"', '"ada ""kutip"""'],
    ['baris\nbaru', '"baris\nbaru"'],
  ])('%p -> %p', (value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });

  it.each(['=1+1', '+62', '-2', '@SUM(A1)'])(
    'teks %p diberi awalan kutip tunggal',
    (value) => {
      expect(csvCell(value, { text: true })).toBe(`'${value}`);
    },
  );
});
