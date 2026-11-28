import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type QueryArgs, queryMock } from '../../../test/fixtures/employees.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { HolidayService } from '../settings/holiday.service.js';
import type { StorageService } from '../storage/storage.service.js';
import type { LeaveBalanceService } from './leave-balance.service.js';
import { LeaveMessages } from './leave.constants.js';
import type { HrLeaveRequestRow } from './leave.mapper.js';
import { LeaveReviewService } from './leave-review.service.js';

const REQUEST = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e60';
const EMPLOYEE = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e10';
const EMPLOYEE_USER = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e11';
const DEPARTMENT = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e01';
const ANNUAL = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e71';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const NOW = new Date('2026-11-26T03:00:00.000Z');

const hr: AuthUser = {
  id: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e99',
  role: 'HR',
  employeeId: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e98',
};

type ReviewRow = {
  id: string;
  employeeId: string;
  kind: 'LEAVE' | 'WFH' | 'BUSINESS_TRIP';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  startDate: Date;
  endDate: Date;
  workingDays: number;
  employee: { userId: string };
  leaveType: { code: string; deductsQuota: boolean } | null;
};

function reviewRow(overrides: Partial<ReviewRow> = {}): ReviewRow {
  return {
    id: REQUEST,
    employeeId: EMPLOYEE,
    kind: 'LEAVE',
    status: 'PENDING',
    startDate: day('2026-12-07'),
    endDate: day('2026-12-09'),
    workingDays: 3,
    employee: { userId: EMPLOYEE_USER },
    leaveType: { code: 'ANNUAL', deductsQuota: true },
    ...overrides,
  };
}

function hrRow(overrides: Partial<HrLeaveRequestRow> = {}): HrLeaveRequestRow {
  return {
    id: REQUEST,
    employeeId: EMPLOYEE,
    kind: 'LEAVE',
    startDate: day('2026-12-07'),
    endDate: day('2026-12-09'),
    workingDays: 3,
    reason: 'Acara keluarga',
    destination: null,
    attachmentKey: null,
    status: 'APPROVED',
    reviewedAt: NOW,
    reviewNote: null,
    createdAt: NOW,
    updatedAt: NOW,
    leaveType: {
      id: ANNUAL,
      code: 'ANNUAL',
      name: 'Cuti tahunan',
      deductsQuota: true,
    },
    reviewedBy: {
      id: hr.id,
      email: 'hr@bluerose.test',
      employee: { fullName: 'Dian Puspitasari' },
    },
    employee: {
      id: EMPLOYEE,
      userId: EMPLOYEE_USER,
      nip: 'BRT-2024-0003',
      fullName: 'Raditya Pratama',
      department: { id: DEPARTMENT, name: 'Teknologi Informasi' },
    },
    ...overrides,
  };
}

const balanceSummary = {
  year: 2026,
  quota: 12,
  used: 7,
  remaining: 5,
  pendingDays: 0,
};

function setup(review: ReviewRow = reviewRow()) {
  const client = {
    leaveRequest: {
      findUnique: queryMock().mockImplementation((args) =>
        Promise.resolve(
          'employee' in (args.select as object) &&
            'reason' in (args.select as object)
            ? hrRow()
            : review,
        ),
      ),
      findMany: queryMock().mockResolvedValue([]),
      count: queryMock().mockResolvedValue(0),
      updateMany: queryMock().mockResolvedValue({ count: 1 }),
    },
    attendance: {
      createMany: queryMock().mockResolvedValue({ count: 2 }),
      updateMany: queryMock().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn(client),
    ),
  };
  const holidays = {
    workingDaysBetween: jest
      .fn<HolidayService['workingDaysBetween']>()
      .mockResolvedValue(3),
    workingDatesBetween: jest
      .fn<HolidayService['workingDatesBetween']>()
      .mockResolvedValue(['2026-12-07', '2026-12-08', '2026-12-09']),
  };
  const storage = {
    createPresignedDownload: jest
      .fn<StorageService['createPresignedDownload']>()
      .mockImplementation((key) =>
        Promise.resolve(`https://storage.test/${key}?signed=1`),
      ),
  };
  const audit = {
    recordChange: jest
      .fn<AuditService['recordChange']>()
      .mockResolvedValue(undefined),
  };
  const balances = {
    findQuotaType: jest
      .fn<LeaveBalanceService['findQuotaType']>()
      .mockResolvedValue({ id: ANNUAL, annualQuota: 12 }),
    consume: jest.fn<LeaveBalanceService['consume']>().mockResolvedValue({
      year: 2026,
      quota: 12,
      usedBefore: 4,
      usedAfter: 7,
    }),
    summary: jest
      .fn<LeaveBalanceService['summary']>()
      .mockResolvedValue(balanceSummary),
  };
  const service = new LeaveReviewService(
    { client } as unknown as PrismaService,
    holidays as unknown as HolidayService,
    storage as unknown as StorageService,
    audit as unknown as AuditService,
    balances as unknown as LeaveBalanceService,
    { now: () => NOW },
  );
  return { service, client, holidays, storage, audit, balances };
}

const firstArgs = (mock: { mock: { calls: QueryArgs[][] } }) =>
  mock.mock.calls[0][0];

describe('LeaveReviewService.approve', () => {
  it('cuti tahunan: status kondisional, saldo, presensi, audit dalam satu transaksi', async () => {
    const { service, client, balances, audit } = setup();

    const result = await service.approve(REQUEST, hr, 'Selamat berlibur');

    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(firstArgs(client.leaveRequest.updateMany)).toEqual({
      where: { id: REQUEST, status: 'PENDING' },
      data: {
        status: 'APPROVED',
        reviewedById: hr.id,
        reviewedAt: NOW,
        reviewNote: 'Selamat berlibur',
        workingDays: 3,
      },
    });
    expect(balances.consume).toHaveBeenCalledWith(client, EMPLOYEE, 2026, 3, {
      id: ANNUAL,
      annualQuota: 12,
    });
    const [change, tx] = audit.recordChange.mock.calls[0];
    expect(tx).toBe(client);
    expect(change).toMatchObject({
      entity: 'LeaveRequest',
      entityId: REQUEST,
      before: { status: 'PENDING', workingDays: 3 },
      after: {
        status: 'APPROVED',
        reviewedById: hr.id,
        balance: { usedBefore: 4, usedAfter: 7 },
        attendance: { status: 'LEAVE', days: 3, created: 2, updated: 1 },
      },
    });
    expect(result).toMatchObject({
      id: REQUEST,
      status: 'APPROVED',
      reviewedBy: { id: hr.id, name: 'Dian Puspitasari' },
      balance: balanceSummary,
    });
  });

  it('presensi: buat baris yang belum ada, ubah yang tanpa absen masuk, hari hadir dibiarkan', async () => {
    const { service, client } = setup();

    await service.approve(REQUEST, hr);

    const days = [day('2026-12-07'), day('2026-12-08'), day('2026-12-09')];
    expect(firstArgs(client.attendance.createMany)).toEqual({
      data: days.map((date) => ({
        employeeId: EMPLOYEE,
        date,
        status: 'LEAVE',
      })),
      skipDuplicates: true,
    });
    expect(firstArgs(client.attendance.updateMany)).toEqual({
      where: {
        employeeId: EMPLOYEE,
        date: { in: days },
        clockInAt: null,
        status: { not: 'LEAVE' },
      },
      data: { status: 'LEAVE', lateMinutes: 0, mode: null },
    });
  });

  it.each([
    ['SICK', 'SICK'],
    ['SPECIAL', 'PERMIT'],
  ])('jenis %s: presensi %s, saldo tidak dipotong', async (code, status) => {
    const { service, client, balances } = setup(
      reviewRow({ leaveType: { code, deductsQuota: false } }),
    );

    await service.approve(REQUEST, hr);

    expect(balances.consume).not.toHaveBeenCalled();
    expect(firstArgs(client.attendance.createMany).data).toEqual(
      expect.arrayContaining([expect.objectContaining({ status })]),
    );
  });

  it('WFH: tanpa saldo dan tanpa baris presensi', async () => {
    const { service, client, balances, holidays } = setup(
      reviewRow({ kind: 'WFH', leaveType: null }),
    );

    await service.approve(REQUEST, hr);

    expect(holidays.workingDatesBetween).not.toHaveBeenCalled();
    expect(holidays.workingDaysBetween).toHaveBeenCalledWith(
      '2026-12-07',
      '2026-12-09',
    );
    expect(balances.consume).not.toHaveBeenCalled();
    expect(client.attendance.createMany).not.toHaveBeenCalled();
  });

  it('hari kerja dihitung ulang (libur baru): workingDays dan saldo memakai nilai baru', async () => {
    const { service, client, balances, holidays } = setup();
    holidays.workingDatesBetween.mockResolvedValue([
      '2026-12-07',
      '2026-12-09',
    ]);

    await service.approve(REQUEST, hr);

    expect(firstArgs(client.leaveRequest.updateMany).data).toMatchObject({
      workingDays: 2,
    });
    expect(balances.consume.mock.calls[0][3]).toBe(2);
  });

  it('rentang tidak lagi berisi hari kerja: 422 tanpa transaksi', async () => {
    const { service, client, holidays } = setup();
    holidays.workingDatesBetween.mockResolvedValue([]);

    await expect(service.approve(REQUEST, hr)).rejects.toThrow(
      new UnprocessableEntityException(LeaveMessages.noWorkingDaysAtReview),
    );
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it('HR memproses pengajuannya sendiri: 403', async () => {
    const { service, client } = setup(
      reviewRow({ employee: { userId: hr.id } }),
    );

    await expect(service.approve(REQUEST, hr)).rejects.toThrow(
      new ForbiddenException(LeaveMessages.ownRequest),
    );
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it('tidak ada: 404', async () => {
    const { service, client } = setup();
    client.leaveRequest.findUnique.mockResolvedValue(null);

    await expect(service.approve(REQUEST, hr)).rejects.toThrow(
      NotFoundException,
    );
  });

  it.each(['APPROVED', 'REJECTED', 'CANCELLED'] as const)(
    'status final %s: 409 tanpa transaksi',
    async (status) => {
      const { service, client } = setup(reviewRow({ status }));

      await expect(service.approve(REQUEST, hr)).rejects.toThrow(
        ConflictException,
      );
      expect(client.$transaction).not.toHaveBeenCalled();
    },
  );

  it('approve lain menang lebih dulu (count 0): 409, saldo/presensi/audit tidak disentuh', async () => {
    const { service, client, balances, audit } = setup();
    client.leaveRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.approve(REQUEST, hr)).rejects.toThrow(
      new ConflictException(LeaveMessages.alreadyProcessed),
    );
    expect(balances.consume).not.toHaveBeenCalled();
    expect(client.attendance.createMany).not.toHaveBeenCalled();
    expect(audit.recordChange).not.toHaveBeenCalled();
  });

  it('saldo tidak cukup: error dari consume membatalkan transaksi (presensi dan audit tidak ditulis)', async () => {
    const { service, client, balances, audit } = setup();
    balances.consume.mockRejectedValue(
      new ConflictException(LeaveMessages.insufficientBalance),
    );

    await expect(service.approve(REQUEST, hr)).rejects.toThrow(
      new ConflictException(LeaveMessages.insufficientBalance),
    );
    expect(client.attendance.createMany).not.toHaveBeenCalled();
    expect(audit.recordChange).not.toHaveBeenCalled();
  });
});

describe('LeaveReviewService.reject', () => {
  it('status kondisional PENDING -> REJECTED dengan catatan, audit, tanpa saldo/presensi', async () => {
    const { service, client, balances, audit } = setup();

    await service.reject(REQUEST, hr, 'Bentrok jadwal rilis');

    expect(firstArgs(client.leaveRequest.updateMany)).toEqual({
      where: { id: REQUEST, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        reviewedById: hr.id,
        reviewedAt: NOW,
        reviewNote: 'Bentrok jadwal rilis',
      },
    });
    expect(balances.consume).not.toHaveBeenCalled();
    expect(client.attendance.createMany).not.toHaveBeenCalled();
    expect(audit.recordChange.mock.calls[0][0]).toMatchObject({
      before: { status: 'PENDING' },
      after: { status: 'REJECTED', reviewNote: 'Bentrok jadwal rilis' },
    });
  });

  it('pengajuan sendiri: 403; sudah final: 409; balapan: 409', async () => {
    await expect(
      setup(reviewRow({ employee: { userId: hr.id } })).service.reject(
        REQUEST,
        hr,
        'x',
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      setup(reviewRow({ status: 'CANCELLED' })).service.reject(
        REQUEST,
        hr,
        'x',
      ),
    ).rejects.toThrow(ConflictException);

    const { service, client, audit } = setup();
    client.leaveRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.reject(REQUEST, hr, 'x')).rejects.toThrow(
      new ConflictException(LeaveMessages.alreadyProcessed),
    );
    expect(audit.recordChange).not.toHaveBeenCalled();
  });
});

describe('LeaveReviewService.list', () => {
  it('filter status, kind, departemen, irisan from-to; urut tanggal mulai terdekat', async () => {
    const { service, client } = setup();
    client.leaveRequest.findMany.mockResolvedValue([hrRow()]);
    client.leaveRequest.count.mockResolvedValue(1);

    const result = await service.list({
      page: 1,
      limit: 20,
      status: 'PENDING',
      kind: 'LEAVE',
      departmentId: DEPARTMENT,
      from: '2026-12-01',
      to: '2026-12-31',
    });

    const args = firstArgs(client.leaveRequest.findMany);
    expect(args.where).toEqual({
      status: 'PENDING',
      kind: 'LEAVE',
      employee: { departmentId: DEPARTMENT },
      startDate: { lte: day('2026-12-31') },
      endDate: { gte: day('2026-12-01') },
    });
    expect(args.orderBy).toEqual([
      { startDate: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ]);
    expect(result.data[0]).toMatchObject({
      employee: {
        nip: 'BRT-2024-0003',
        department: { name: 'Teknologi Informasi' },
      },
    });
    expect(result.data[0]).not.toHaveProperty('employee.userId');
  });

  it('to sebelum from: 400', async () => {
    const { service } = setup();

    await expect(
      service.list({
        page: 1,
        limit: 20,
        from: '2026-12-31',
        to: '2026-12-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('LeaveReviewService.findOne', () => {
  it('lampiran: presigned URL 5 menit; cuti tahunan: saldo tahun pengajuan', async () => {
    const { service, client, storage, balances } = setup();
    client.leaveRequest.findUnique.mockResolvedValue(
      hrRow({ attachmentKey: `leave/${EMPLOYEE}/abc` }),
    );

    const result = await service.findOne(REQUEST);

    expect(storage.createPresignedDownload).toHaveBeenCalledWith(
      `leave/${EMPLOYEE}/abc`,
      300,
    );
    expect(result.attachment).toEqual({
      url: `https://storage.test/leave/${EMPLOYEE}/abc?signed=1`,
      expiresAt: '2026-11-26T03:05:00.000Z',
    });
    expect(balances.summary).toHaveBeenCalledWith(EMPLOYEE, 2026);
    expect(result.balance).toEqual(balanceSummary);
    expect(result.hasAttachment).toBe(true);
  });

  it('tanpa lampiran dan bukan cuti tahunan: attachment dan balance null', async () => {
    const { service, client, storage, balances } = setup();
    client.leaveRequest.findUnique.mockResolvedValue(
      hrRow({ kind: 'WFH', leaveType: null }),
    );

    const result = await service.findOne(REQUEST);

    expect(result).toMatchObject({ attachment: null, balance: null });
    expect(storage.createPresignedDownload).not.toHaveBeenCalled();
    expect(balances.summary).not.toHaveBeenCalled();
  });

  it('tidak ada: 404', async () => {
    const { service, client } = setup();
    client.leaveRequest.findUnique.mockResolvedValue(null);

    await expect(service.findOne(REQUEST)).rejects.toThrow(
      new NotFoundException(LeaveMessages.notFound),
    );
  });
});
