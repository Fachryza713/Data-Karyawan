import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { type QueryArgs, queryMock } from '../../../test/fixtures/employees.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { RedisLockService } from '../../redis/redis-lock.service.js';
import type { HolidayService } from '../settings/holiday.service.js';
import { AbsenceJob } from './absence.job.js';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

// Error yang sengaja dipicu (Redis mati, DB gagal) tidak perlu dicetak.
beforeAll(() => {
  Logger.overrideLogger(false);
});

function setup() {
  const client = {
    employee: {
      findMany: queryMock().mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]),
    },
    attendance: {
      createMany: queryMock().mockResolvedValue({ count: 2 }),
    },
  };
  const holidays = {
    isWorkingDay: jest
      .fn<HolidayService['isWorkingDay']>()
      .mockResolvedValue(true),
  };
  const lock = {
    acquire: jest
      .fn<RedisLockService['acquire']>()
      .mockResolvedValue('token-1'),
    release: jest.fn<RedisLockService['release']>().mockResolvedValue(true),
  };
  // 26 Nov 2026 23:59 WIB.
  const clock = { now: () => new Date('2026-11-26T16:59:00.000Z') };
  const job = new AbsenceJob(
    { client } as unknown as PrismaService,
    holidays as unknown as HolidayService,
    lock as unknown as RedisLockService,
    clock,
  );
  return { job, client, holidays, lock };
}

const firstArgs = (mock: { mock: { calls: QueryArgs[][] } }) =>
  mock.mock.calls[0][0];

describe('AbsenceJob.markAbsent', () => {
  it('hari kerja: karyawan aktif tanpa baris ditandai ABSENT dengan skipDuplicates', async () => {
    const { job, client } = setup();

    await expect(job.markAbsent('2026-11-26')).resolves.toBe(2);

    expect(firstArgs(client.employee.findMany).where).toEqual({
      user: { role: 'EMPLOYEE', isActive: true },
      joinDate: { lte: day('2026-11-26') },
      attendances: { none: { date: day('2026-11-26') } },
    });
    expect(client.attendance.createMany).toHaveBeenCalledWith({
      data: [
        { employeeId: 'e1', date: day('2026-11-26'), status: 'ABSENT' },
        { employeeId: 'e2', date: day('2026-11-26'), status: 'ABSENT' },
      ],
      skipDuplicates: true,
    });
  });

  it('bukan hari kerja: tidak menandai siapa pun', async () => {
    const { job, client, holidays } = setup();
    holidays.isWorkingDay.mockResolvedValue(false);

    await expect(job.markAbsent('2026-11-28')).resolves.toBe(0);
    expect(client.employee.findMany).not.toHaveBeenCalled();
  });

  it('dijalankan ulang: tidak ada karyawan tersisa, tidak ada insert', async () => {
    const { job, client } = setup();
    client.employee.findMany.mockResolvedValue([]);

    await expect(job.markAbsent('2026-11-26')).resolves.toBe(0);
    expect(client.attendance.createMany).not.toHaveBeenCalled();
  });
});

describe('AbsenceJob.run (lock Redis)', () => {
  it('cron memakai tanggal WIB dan lock per tanggal', async () => {
    const { job, lock } = setup();

    await job.handleCron();

    expect(lock.acquire).toHaveBeenCalledWith(
      'lock:attendance:mark-absent:2026-11-26',
      15 * 60 * 1000,
    );
  });

  it('berhasil: lock tidak dilepas (instance lain tidak mengulang)', async () => {
    const { job, lock } = setup();

    await expect(job.run('2026-11-26')).resolves.toEqual({
      ran: true,
      marked: 2,
    });
    expect(lock.release).not.toHaveBeenCalled();
  });

  it('lock dipegang instance lain: dilewati tanpa query', async () => {
    const { job, lock, client } = setup();
    lock.acquire.mockResolvedValue(null);

    await expect(job.run('2026-11-26')).resolves.toEqual({
      ran: false,
      reason: 'locked',
    });
    expect(client.employee.findMany).not.toHaveBeenCalled();
  });

  it('Redis tidak tersedia: dilewati (fail closed)', async () => {
    const { job, lock, client } = setup();
    lock.acquire.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(job.run('2026-11-26')).resolves.toEqual({
      ran: false,
      reason: 'lock_unavailable',
    });
    expect(client.employee.findMany).not.toHaveBeenCalled();
  });

  it('gagal di tengah jalan: lock dilepas supaya bisa dicoba lagi', async () => {
    const { job, lock, client } = setup();
    client.attendance.createMany.mockRejectedValue(new Error('db down'));

    await expect(job.run('2026-11-26')).resolves.toEqual({
      ran: false,
      reason: 'failed',
    });
    expect(lock.release).toHaveBeenCalledWith(
      'lock:attendance:mark-absent:2026-11-26',
      'token-1',
    );
  });
});
