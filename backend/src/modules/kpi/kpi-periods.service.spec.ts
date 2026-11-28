import { jest } from '@jest/globals';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type QueryArgs, queryMock } from '../../../test/fixtures/employees.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import { KpiPeriodsService } from './kpi-periods.service.js';
import { KpiMessages } from './kpi.constants.js';

const d = (value: string) => new Prisma.Decimal(value);
const PERIOD = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9f01';
// Selasa 14 April 2026 10:00 WIB.
const NOW = new Date('2026-04-14T03:00:00.000Z');
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

const periodRow = (status: 'DRAFT' | 'ACTIVE' | 'CLOSED' = 'DRAFT') => ({
  id: PERIOD,
  name: 'Q1 2026',
  startDate: date('2026-01-01'),
  endDate: date('2026-03-31'),
  deadline: date('2026-04-15'),
  status,
  activatedAt: status === 'DRAFT' ? null : NOW,
  closedAt: status === 'CLOSED' ? NOW : null,
  createdAt: NOW,
  updatedAt: NOW,
  _count: { reviews: 0 },
});

const employee = (id: string, positionId: string, positionName: string) => ({
  id,
  positionId,
  departmentId: 'dept-it',
  position: { name: positionName, department: { name: 'Teknologi Informasi' } },
});

const indicator = (id: string, weight: string, order: number) => ({
  id,
  name: `Indikator ${id}`,
  description: null,
  weight: d(weight),
  target: null,
  order,
});

function setup(status: 'DRAFT' | 'ACTIVE' | 'CLOSED' = 'DRAFT') {
  const client = {
    kpiPeriod: {
      findUnique: queryMock().mockResolvedValue(periodRow(status)),
      findFirst: queryMock().mockResolvedValue(null),
      findMany: queryMock().mockResolvedValue([]),
      create: queryMock().mockResolvedValue(periodRow()),
      updateMany: queryMock().mockResolvedValue({ count: 1 }),
    },
    employee: {
      findMany: queryMock().mockResolvedValue([
        employee('emp-1', 'pos-fe', 'Frontend Developer'),
        employee('emp-2', 'pos-fe', 'Frontend Developer'),
        employee('emp-3', 'pos-be', 'Backend Developer'),
      ]),
    },
    kpiTemplate: {
      findMany: queryMock().mockResolvedValue([
        {
          id: 'tpl-fe',
          positionId: 'pos-fe',
          indicators: [indicator('i1', '60', 0), indicator('i2', '40', 1)],
        },
        {
          id: 'tpl-be',
          positionId: 'pos-be',
          indicators: [
            indicator('i3', '33.33', 0),
            indicator('i4', '33.33', 1),
            indicator('i5', '33.34', 2),
          ],
        },
      ]),
    },
    kpiReview: {
      createManyAndReturn: jest.fn(
        (args: { data: { employeeId: string; positionId: string }[] }) =>
          Promise.resolve(
            args.data.map((row) => ({
              id: `rev-${row.employeeId}`,
              positionId: row.positionId,
            })),
          ),
      ),
      count: queryMock().mockResolvedValue(0),
      groupBy: queryMock().mockResolvedValue([]),
      aggregate: queryMock().mockResolvedValue({ _avg: { finalScore: null } }),
    },
    kpiScore: { createMany: queryMock().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn(client),
    ),
  };
  const audit = {
    recordChange: jest
      .fn<AuditService['recordChange']>()
      .mockResolvedValue(undefined),
  };
  const service = new KpiPeriodsService(
    { client } as unknown as PrismaService,
    audit as unknown as AuditService,
    { now: () => NOW },
  );
  return { service, client, audit };
}

const args = (mock: { mock: { calls: QueryArgs[][] } }, index = 0) =>
  mock.mock.calls[index][0];

function knownError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('prisma error', {
    code,
    clientVersion: Prisma.prismaVersion.client,
  });
}

describe('KpiPeriodsService.activate', () => {
  it('satu transaksi: status ACTIVE dulu, lalu review DRAFT per karyawan aktif + snapshot indikator', async () => {
    const { service, client, audit } = setup('DRAFT');
    client.kpiPeriod.findUnique
      .mockResolvedValueOnce(periodRow('DRAFT'))
      .mockResolvedValue(periodRow('ACTIVE'));

    const result = await service.activate(PERIOD);

    expect(result.reviewsCreated).toBe(3);
    expect(client.$transaction).toHaveBeenCalledTimes(1);
    // Karyawan aktif: belum dihapus (extension), akun aktif, bergabung sebelum akhir periode.
    expect(args(client.employee.findMany).where).toEqual({
      user: { isActive: true },
      joinDate: { lte: date('2026-03-31') },
    });
    expect(args(client.kpiPeriod.updateMany)).toEqual({
      where: { id: PERIOD, status: 'DRAFT' },
      data: { status: 'ACTIVE', activatedAt: NOW },
    });
    expect(
      client.kpiPeriod.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(
      client.kpiReview.createManyAndReturn.mock.invocationCallOrder[0],
    );
    expect(client.kpiReview.createManyAndReturn.mock.calls[0][0].data).toEqual([
      {
        periodId: PERIOD,
        employeeId: 'emp-1',
        positionId: 'pos-fe',
        departmentId: 'dept-it',
        templateId: 'tpl-fe',
      },
      {
        periodId: PERIOD,
        employeeId: 'emp-2',
        positionId: 'pos-fe',
        departmentId: 'dept-it',
        templateId: 'tpl-fe',
      },
      {
        periodId: PERIOD,
        employeeId: 'emp-3',
        positionId: 'pos-be',
        departmentId: 'dept-it',
        templateId: 'tpl-be',
      },
    ]);
    const scores = args(client.kpiScore.createMany).data as unknown as Record<
      string,
      unknown
    >[];
    expect(scores).toHaveLength(2 + 2 + 3);
    expect(scores[0]).toEqual({
      reviewId: 'rev-emp-1',
      indicatorId: 'i1',
      name: 'Indikator i1',
      description: null,
      weight: d('60'),
      target: null,
      order: 0,
    });
    expect(audit.recordChange.mock.calls[0][0]).toMatchObject({
      entity: 'KpiPeriod',
      entityId: PERIOD,
      before: { status: 'DRAFT' },
      after: { status: 'ACTIVE', reviewsCreated: 3 },
    });
  });

  it('ditolak 422 + daftar jabatan jika ada jabatan dengan karyawan aktif tanpa template valid', async () => {
    const { service, client } = setup('DRAFT');
    client.employee.findMany.mockResolvedValue([
      employee('emp-1', 'pos-fe', 'Frontend Developer'),
      employee('emp-3', 'pos-be', 'Backend Developer'),
      employee('emp-4', 'pos-log', 'Staf Logistik'),
    ]);
    client.kpiTemplate.findMany.mockResolvedValue([
      {
        id: 'tpl-fe',
        positionId: 'pos-fe',
        indicators: [indicator('i1', '60', 0), indicator('i2', '40', 1)],
      },
      {
        id: 'tpl-be',
        positionId: 'pos-be',
        indicators: [
          indicator('i3', '33.33', 0),
          indicator('i4', '33.33', 1),
          indicator('i5', '33.33', 2),
        ],
      },
    ]);

    const error = await service.activate(PERIOD).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject(
      {
        details: {
          positions: [
            {
              positionName: 'Backend Developer',
              templateId: 'tpl-be',
              activeEmployees: 1,
              problem: 'Total bobot 99.99, harus 100.00',
            },
            {
              positionName: 'Staf Logistik',
              templateId: null,
              activeEmployees: 1,
              problem: 'Belum ada template aktif',
            },
          ],
        },
      },
    );
    expect(client.kpiPeriod.updateMany).not.toHaveBeenCalled();
    expect(client.kpiReview.createManyAndReturn).not.toHaveBeenCalled();
  });

  it('ada periode lain yang ACTIVE: 409 dengan namanya', async () => {
    const { service, client } = setup('DRAFT');
    client.kpiPeriod.findFirst.mockResolvedValue({ name: 'Q4 2025' });

    await expect(service.activate(PERIOD)).rejects.toThrow(
      new ConflictException(KpiMessages.otherPeriodActive('Q4 2025')),
    );
    expect(client.employee.findMany).not.toHaveBeenCalled();
  });

  it.each(['ACTIVE', 'CLOSED'] as const)(
    'periode %s tidak bisa diaktifkan: 409',
    async (status) => {
      const { service } = setup(status);
      await expect(service.activate(PERIOD)).rejects.toThrow(ConflictException);
    },
  );

  it('bentrok index unik (periode lain diaktifkan bersamaan): 409', async () => {
    const { service, client } = setup('DRAFT');
    client.kpiPeriod.updateMany.mockRejectedValue(knownError('P2002'));

    await expect(service.activate(PERIOD)).rejects.toThrow(
      new ConflictException(KpiMessages.activeConflict),
    );
  });

  it('tidak ada karyawan aktif: 422; periode tidak ada: 404', async () => {
    const empty = setup('DRAFT');
    empty.client.employee.findMany.mockResolvedValue([]);
    await expect(empty.service.activate(PERIOD)).rejects.toThrow(
      new UnprocessableEntityException(KpiMessages.noActiveEmployees),
    );

    const missing = setup();
    missing.client.kpiPeriod.findUnique.mockResolvedValue(null);
    await expect(missing.service.activate(PERIOD)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('KpiPeriodsService lainnya', () => {
  it('create: tanggal dicek, nama ganda 409', async () => {
    const { service, client } = setup();
    await expect(
      service.create({
        name: 'Q1 2026',
        startDate: '2026-01-01',
        endDate: '2025-12-31',
        deadline: '2026-04-15',
      }),
    ).rejects.toThrow(UnprocessableEntityException);

    client.kpiPeriod.create.mockRejectedValue(knownError('P2002'));
    await expect(
      service.create({
        name: 'Q1 2026',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        deadline: '2026-04-15',
      }),
    ).rejects.toThrow(new ConflictException(KpiMessages.periodNameExists));
  });

  it('update periode ACTIVE: hanya deadline', async () => {
    const { service, client } = setup('ACTIVE');

    await service.update(PERIOD, { deadline: '2026-04-30' });
    expect(args(client.kpiPeriod.updateMany)).toMatchObject({
      where: { id: PERIOD, status: 'ACTIVE' },
      data: { deadline: date('2026-04-30') },
    });
    await expect(service.update(PERIOD, { name: 'Q1' })).rejects.toThrow(
      new ConflictException(KpiMessages.activeOnlyDeadline),
    );
  });

  it('close: ACTIVE -> CLOSED; DRAFT ditolak 409', async () => {
    const active = setup('ACTIVE');
    await active.service.close(PERIOD);
    expect(args(active.client.kpiPeriod.updateMany)).toEqual({
      where: { id: PERIOD, status: 'ACTIVE' },
      data: { status: 'CLOSED', closedAt: NOW },
    });

    const draft = setup('DRAFT');
    await expect(draft.service.close(PERIOD)).rejects.toThrow(
      ConflictException,
    );
  });

  it('progress: dinilai/total, rata-rata FINAL 1 desimal, hari ke tenggat (WIB)', async () => {
    const { service, client } = setup('ACTIVE');
    client.kpiReview.groupBy.mockResolvedValue([
      { status: 'FINAL', _count: { _all: 108 } },
      { status: 'DRAFT', _count: { _all: 20 } },
    ]);
    client.kpiReview.aggregate.mockResolvedValue({
      _avg: { finalScore: d('82.35') },
    });

    await expect(service.progress(PERIOD)).resolves.toEqual({
      periodId: PERIOD,
      name: 'Q1 2026',
      status: 'ACTIVE',
      deadline: '2026-04-15',
      daysToDeadline: 1,
      isOverdue: false,
      total: 128,
      finalized: 108,
      remaining: 20,
      percentFinalized: 84,
      averageScore: '82.4',
    });
    expect(args(client.kpiReview.aggregate).where).toEqual({
      periodId: PERIOD,
      status: 'FINAL',
    });
  });

  it('progress: tenggat lewat dan masih ada DRAFT = overdue; tanpa review = 0%', async () => {
    const { service, client } = setup('ACTIVE');
    client.kpiPeriod.findUnique.mockResolvedValue({
      ...periodRow('ACTIVE'),
      deadline: date('2026-04-10'),
    });
    client.kpiReview.groupBy.mockResolvedValue([
      { status: 'DRAFT', _count: { _all: 3 } },
    ]);

    await expect(service.progress(PERIOD)).resolves.toMatchObject({
      daysToDeadline: -4,
      isOverdue: true,
      percentFinalized: 0,
      averageScore: null,
    });
  });
});
