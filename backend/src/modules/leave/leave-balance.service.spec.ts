import { jest } from '@jest/globals';
import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { type QueryArgs, queryMock } from '../../../test/fixtures/employees.js';
import type {
  AppTransactionClient,
  PrismaService,
} from '../../prisma/prisma.service.js';
import { LeaveBalanceJob } from './leave-balance.job.js';
import { LeaveBalanceService } from './leave-balance.service.js';
import { LeaveMessages } from './leave.constants.js';

const USER = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e11';
const EMPLOYEE = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e10';
const OTHER = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e12';
const ANNUAL = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e71';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const type = { id: ANNUAL, annualQuota: 12 };

// Log job dan error yang sengaja dipicu tidak perlu dicetak.
beforeAll(() => {
  Logger.overrideLogger(false);
});

/** 31 Des 2026 23:30 WIB = 16:30 UTC; 1 Jan 2027 00:05 WIB = 31 Des 17:05 UTC. */
function setup(nowIso = '2026-11-26T03:00:00.000Z') {
  const client = {
    employee: {
      findUnique: queryMock().mockResolvedValue({ id: EMPLOYEE }),
      findMany: queryMock().mockResolvedValue([]),
    },
    leaveType: {
      findFirst: queryMock().mockResolvedValue({
        id: ANNUAL,
        annualQuota: 12,
      }),
    },
    leaveBalance: {
      createMany: queryMock().mockResolvedValue({ count: 1 }),
      findUnique: queryMock().mockResolvedValue(null),
    },
    leaveRequest: {
      aggregate: queryMock().mockResolvedValue({
        _sum: { workingDays: null },
      }),
    },
    $queryRaw: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };
  const service = new LeaveBalanceService(
    { client } as unknown as PrismaService,
    { now: () => new Date(nowIso) },
  );
  return { service, client };
}

const firstArgs = (mock: { mock: { calls: QueryArgs[][] } }) =>
  mock.mock.calls[0][0];

/** Teks SQL dari panggilan tagged template $queryRaw. */
const sqlOf = (call: unknown[]) =>
  (call[0] as TemplateStringsArray).join('?').replace(/\s+/g, ' ');

describe('LeaveBalanceService.currentYear', () => {
  it('tahun kalender WIB, bukan UTC', () => {
    expect(setup('2026-12-31T16:30:00.000Z').service.currentYear()).toBe(2026);
    expect(setup('2026-12-31T17:05:00.000Z').service.currentYear()).toBe(2027);
  });
});

describe('LeaveBalanceService.ensureForEmployee (karyawan baru)', () => {
  it('saldo tahun berjalan, kuota dari jenis cuti tahunan, idempotent, ikut tx', async () => {
    const { service, client } = setup();
    const tx = client as unknown as AppTransactionClient;

    await service.ensureForEmployee(EMPLOYEE, tx);

    expect(firstArgs(client.leaveType.findFirst).where).toEqual({
      deductsQuota: true,
    });
    expect(firstArgs(client.leaveBalance.createMany)).toEqual({
      data: [{ employeeId: EMPLOYEE, year: 2026, quota: 12 }],
      skipDuplicates: true,
    });
  });

  it('belum ada jenis cuti tahunan: tidak membuat saldo dan tidak gagal', async () => {
    const { service, client } = setup();
    client.leaveType.findFirst.mockResolvedValue(null);

    await expect(service.ensureForEmployee(EMPLOYEE)).resolves.toBeUndefined();
    expect(client.leaveBalance.createMany).not.toHaveBeenCalled();
  });
});

describe('LeaveBalanceService.createForYear (job 1 Januari)', () => {
  it('karyawan aktif yang belum punya saldo tahun itu; skipDuplicates', async () => {
    const { service, client } = setup();
    client.employee.findMany.mockResolvedValue([
      { id: EMPLOYEE },
      { id: OTHER },
    ]);
    client.leaveBalance.createMany.mockResolvedValue({ count: 2 });

    await expect(service.createForYear(2027)).resolves.toBe(2);

    expect(firstArgs(client.employee.findMany).where).toEqual({
      user: { isActive: true },
      leaveBalances: { none: { year: 2027 } },
    });
    expect(firstArgs(client.leaveBalance.createMany)).toEqual({
      data: [
        { employeeId: EMPLOYEE, year: 2027, quota: 12 },
        { employeeId: OTHER, year: 2027, quota: 12 },
      ],
      skipDuplicates: true,
    });
  });

  it('dijalankan ulang: semua sudah punya saldo, tidak ada insert', async () => {
    const { service, client } = setup();

    await expect(service.createForYear(2027)).resolves.toBe(0);
    expect(client.leaveBalance.createMany).not.toHaveBeenCalled();
  });
});

describe('LeaveBalanceJob', () => {
  it('cron memakai tahun WIB saat ini', async () => {
    const { service } = setup('2026-12-31T17:05:00.000Z');
    const createForYear = jest
      .spyOn(service, 'createForYear')
      .mockResolvedValue(30);

    await new LeaveBalanceJob(service).handleCron();

    expect(createForYear).toHaveBeenCalledWith(2027);
  });

  it('gagal: dicatat, tidak melempar (cron tetap hidup)', async () => {
    const { service } = setup();
    jest
      .spyOn(service, 'createForYear')
      .mockRejectedValue(new Error('db down'));

    await expect(new LeaveBalanceJob(service).run(2027)).resolves.toBeNull();
  });
});

describe('LeaveBalanceService.summary / getMine', () => {
  it('saldo tersimpan + hari cuti tahunan PENDING di tahun itu', async () => {
    const { service, client } = setup();
    client.leaveBalance.findUnique.mockResolvedValue({ quota: 12, used: 5 });
    client.leaveRequest.aggregate.mockResolvedValue({
      _sum: { workingDays: 3 },
    });

    await expect(service.getMine(USER)).resolves.toEqual({
      year: 2026,
      quota: 12,
      used: 5,
      remaining: 7,
      pendingDays: 3,
    });
    expect(firstArgs(client.employee.findUnique).where).toEqual({
      userId: USER,
    });
    expect(firstArgs(client.leaveRequest.aggregate).where).toEqual({
      employeeId: EMPLOYEE,
      leaveTypeId: ANNUAL,
      status: 'PENDING',
      startDate: { gte: day('2026-01-01'), lte: day('2026-12-31') },
    });
  });

  it('baris saldo belum dibuat: kuota penuh, used 0', async () => {
    const { service } = setup();

    await expect(service.getMine(USER, 2027)).resolves.toMatchObject({
      year: 2027,
      quota: 12,
      used: 0,
      remaining: 12,
    });
  });

  it('akun tanpa data karyawan: 404; tanpa jenis cuti tahunan: 404', async () => {
    const noEmployee = setup();
    noEmployee.client.employee.findUnique.mockResolvedValue(null);
    await expect(noEmployee.service.getMine(USER)).rejects.toThrow(
      NotFoundException,
    );

    const noType = setup();
    noType.client.leaveType.findFirst.mockResolvedValue(null);
    await expect(noType.service.getMine(USER)).rejects.toThrow(
      new NotFoundException(LeaveMessages.noAnnualLeaveType),
    );
  });
});

describe('LeaveBalanceService.consume (approve)', () => {
  it('satu UPDATE bersyarat used + n <= quota, bukan baca-cek-tulis', async () => {
    const { service, client } = setup();
    client.$queryRaw.mockResolvedValue([{ used: 7, quota: 12 }]);
    const tx = client as unknown as AppTransactionClient;

    await expect(service.consume(tx, EMPLOYEE, 2026, 3, type)).resolves.toEqual(
      { year: 2026, quota: 12, usedBefore: 4, usedAfter: 7 },
    );

    // Baris saldo dipastikan ada dulu (INSERT ... ON CONFLICT DO NOTHING).
    expect(firstArgs(client.leaveBalance.createMany)).toEqual({
      data: [{ employeeId: EMPLOYEE, year: 2026, quota: 12 }],
      skipDuplicates: true,
    });
    const call = client.$queryRaw.mock.calls[0];
    expect(sqlOf(call)).toContain(
      'SET "used" = "used" + ?, "updated_at" = now()',
    );
    expect(sqlOf(call)).toContain('AND "used" + ? <= "quota"');
    expect(call.slice(1)).toEqual([3, EMPLOYEE, 2026, 3]);
    // Tidak membaca saldo sebelum UPDATE.
    expect(client.leaveBalance.findUnique).not.toHaveBeenCalled();
  });

  it('0 baris terpengaruh: 409 "Saldo cuti tidak cukup" dengan sisa saldo', async () => {
    const { service, client } = setup();
    client.$queryRaw.mockResolvedValue([]);
    client.leaveBalance.findUnique.mockResolvedValue({ quota: 12, used: 10 });
    const tx = client as unknown as AppTransactionClient;

    const error = await service
      .consume(tx, EMPLOYEE, 2026, 3, type)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      message: 'Saldo cuti tidak cukup',
      details: { year: 2026, requestedDays: 3, remainingDays: 2 },
    });
  });
});
