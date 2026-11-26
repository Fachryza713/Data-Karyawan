import { jest } from '@jest/globals';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { type QueryArgs, queryMock } from '../../../test/fixtures/employees.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import { HolidayService } from './holiday.service.js';
import { SettingsMessages } from './settings.constants.js';

const HOLIDAY = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e20';
const at = new Date('2026-11-25T01:00:00.000Z');
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

function setup() {
  const client = {
    holiday: {
      findMany: queryMock().mockResolvedValue([]),
      findUnique: queryMock().mockResolvedValue(null),
      create: queryMock(),
      delete: queryMock().mockResolvedValue({}),
    },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn(client),
    ),
  };
  const audit = {
    recordChange: jest
      .fn<AuditService['recordChange']>()
      .mockResolvedValue(undefined),
  };
  const holidays = new HolidayService(
    { client } as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  return { client, audit, holidays };
}

const firstArgs = (mock: { mock: { calls: QueryArgs[][] } }) =>
  mock.mock.calls[0][0];

describe('HolidayService.workingDaysBetween', () => {
  it('melewati akhir pekan dan hari libur dari database', async () => {
    const { holidays, client } = setup();
    client.holiday.findMany.mockResolvedValue([{ date: day('2026-08-17') }]);

    // Jumat 14 s.d. Selasa 18 Agustus 2026.
    await expect(
      holidays.workingDaysBetween('2026-08-14', '2026-08-18'),
    ).resolves.toBe(2);
    // Hanya libur di dalam rentang yang diambil.
    expect(firstArgs(client.holiday.findMany).where).toEqual({
      date: { gte: day('2026-08-14'), lte: day('2026-08-18') },
    });
  });

  it('libur di akhir pekan tidak mengurangi dua kali', async () => {
    const { holidays, client } = setup();
    client.holiday.findMany.mockResolvedValue([
      { date: day('2026-05-31') },
      { date: day('2026-06-01') },
    ]);

    await expect(
      holidays.workingDaysBetween('2026-05-29', '2026-06-02'),
    ).resolves.toBe(2);
  });

  it('menerima Date (misalnya kolom @db.Date): satu bulan November 2026 = 21', async () => {
    const { holidays } = setup();

    await expect(
      holidays.workingDaysBetween(day('2026-11-01'), day('2026-11-30')),
    ).resolves.toBe(21);
  });

  it('tanggal akhir sebelum tanggal awal: 0 tanpa query', async () => {
    const { holidays, client } = setup();

    await expect(
      holidays.workingDaysBetween('2026-11-30', '2026-11-01'),
    ).resolves.toBe(0);
    expect(client.holiday.findMany).not.toHaveBeenCalled();
  });

  it('tanggal tidak valid: RangeError', async () => {
    const { holidays } = setup();

    await expect(
      holidays.workingDaysBetween('2026-02-30', '2026-03-02'),
    ).rejects.toThrow(RangeError);
  });
});

describe('HolidayService.isWorkingDay', () => {
  it('Sabtu bukan hari kerja, tanpa query', async () => {
    const { holidays, client } = setup();

    await expect(holidays.isWorkingDay('2026-11-28')).resolves.toBe(false);
    expect(client.holiday.findUnique).not.toHaveBeenCalled();
  });

  it('hari kerja biasa: true', async () => {
    const { holidays, client } = setup();

    await expect(holidays.isWorkingDay('2026-11-26')).resolves.toBe(true);
    expect(firstArgs(client.holiday.findUnique).where).toEqual({
      date: day('2026-11-26'),
    });
  });

  it('hari libur di hari kerja: false', async () => {
    const { holidays, client } = setup();
    client.holiday.findUnique.mockResolvedValue({ id: HOLIDAY });

    await expect(holidays.isWorkingDay('2026-08-17')).resolves.toBe(false);
  });

  it('waktu presensi dibaca dalam WIB: Jumat 27 Nov 2026 01:00 WIB tetap hari Jumat', async () => {
    const { holidays, client } = setup();

    await expect(
      holidays.isWorkingDay(new Date('2026-11-26T18:00:00.000Z')),
    ).resolves.toBe(true);
    expect(firstArgs(client.holiday.findUnique).where).toEqual({
      date: day('2026-11-27'),
    });
  });
});

describe('HolidayService CRUD', () => {
  it('daftar per tahun memfilter 1 Januari sampai 31 Desember', async () => {
    const { holidays, client } = setup();
    client.holiday.findMany.mockResolvedValue([
      {
        id: HOLIDAY,
        date: day('2026-08-17'),
        name: 'Hari Kemerdekaan',
        createdAt: at,
        updatedAt: at,
      },
    ]);

    await expect(holidays.list({ year: 2026 })).resolves.toEqual([
      {
        id: HOLIDAY,
        date: '2026-08-17',
        name: 'Hari Kemerdekaan',
        createdAt: at.toISOString(),
        updatedAt: at.toISOString(),
      },
    ]);
    expect(firstArgs(client.holiday.findMany)).toMatchObject({
      where: { date: { gte: day('2026-01-01'), lte: day('2026-12-31') } },
      orderBy: { date: 'asc' },
    });
  });

  it('daftar tanpa tahun: semua hari libur', async () => {
    const { holidays, client } = setup();

    await holidays.list({});

    expect(firstArgs(client.holiday.findMany).where).toEqual({});
  });

  it('tanggal yang sudah terdaftar ditolak 409', async () => {
    const { holidays, client } = setup();
    client.holiday.findUnique.mockResolvedValue({
      id: HOLIDAY,
      name: 'Hari Kemerdekaan',
    });

    const error = await holidays
      .create({ date: '2026-08-17', name: 'Libur lain' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      message:
        'Tanggal 2026-08-17 sudah terdaftar sebagai hari libur: Hari Kemerdekaan',
      details: { holidayId: HOLIDAY },
    });
    expect(client.holiday.create).not.toHaveBeenCalled();
  });

  it('tambah hari libur: disimpan sebagai tanggal dan dicatat audit', async () => {
    const { holidays, client, audit } = setup();
    client.holiday.create.mockResolvedValue({
      id: HOLIDAY,
      date: day('2026-12-24'),
      name: 'Cuti bersama Natal',
      createdAt: at,
      updatedAt: at,
    });

    const result = await holidays.create({
      date: '2026-12-24',
      name: 'Cuti bersama Natal',
    });

    expect(result.date).toBe('2026-12-24');
    expect(firstArgs(client.holiday.create).data).toEqual({
      date: day('2026-12-24'),
      name: 'Cuti bersama Natal',
    });
    expect(audit.recordChange).toHaveBeenCalledWith(
      {
        entity: 'Holiday',
        entityId: HOLIDAY,
        after: { date: '2026-12-24', name: 'Cuti bersama Natal' },
      },
      client,
    );
  });

  it('hapus hari libur yang tidak ada: 404', async () => {
    const { holidays } = setup();

    await expect(holidays.remove(HOLIDAY)).rejects.toThrow(
      new NotFoundException(SettingsMessages.holidayNotFound),
    );
  });

  it('hapus hari libur: dicatat audit dengan data sebelumnya', async () => {
    const { holidays, client, audit } = setup();
    client.holiday.findUnique.mockResolvedValue({
      id: HOLIDAY,
      date: day('2026-12-24'),
      name: 'Cuti bersama Natal',
      createdAt: at,
      updatedAt: at,
    });

    await holidays.remove(HOLIDAY);

    expect(firstArgs(client.holiday.delete).where).toEqual({ id: HOLIDAY });
    expect(audit.recordChange).toHaveBeenCalledWith(
      {
        entity: 'Holiday',
        entityId: HOLIDAY,
        before: { date: '2026-12-24', name: 'Cuti bersama Natal' },
      },
      client,
    );
  });
});
