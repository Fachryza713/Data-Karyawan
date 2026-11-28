import { jest } from '@jest/globals';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type QueryArgs, queryMock } from '../../../test/fixtures/employees.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import { KpiReviewsService } from './kpi-reviews.service.js';
import { KpiMessages } from './kpi.constants.js';

const d = (value: string) => new Prisma.Decimal(value);
const REVIEW = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9f10';
const I1 = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9f21';
const I2 = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9f22';
const NOW = new Date('2026-04-14T03:00:00.000Z');
const hr: AuthUser = { id: 'user-hr', role: 'HR', employeeId: null };

const locked = (overrides: Record<string, unknown> = {}) => ({
  status: 'DRAFT',
  periodId: 'period-1',
  employeeId: 'emp-1',
  periodStatus: 'ACTIVE',
  periodName: 'Q1 2026',
  employeeUserId: 'user-karyawan',
  ...overrides,
});

function setup() {
  const client = {
    $queryRaw: jest
      .fn<(...args: unknown[]) => Promise<unknown[]>>()
      .mockResolvedValue([locked()]),
    kpiScore: {
      findMany: queryMock().mockResolvedValue([
        { indicatorId: I1, name: 'Kualitas', score: d('90'), weight: d('60') },
        {
          indicatorId: I2,
          name: 'Kecepatan',
          score: d('77.5'),
          weight: d('40'),
        },
      ]),
      update: queryMock().mockResolvedValue({}),
    },
    kpiReview: {
      update: queryMock().mockResolvedValue({}),
      findMany: queryMock().mockResolvedValue([]),
      count: queryMock().mockResolvedValue(0),
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
  const service = new KpiReviewsService(
    { client } as unknown as PrismaService,
    audit as unknown as AuditService,
    { now: () => NOW },
  );
  // findOne() setelah transaksi membaca detail lengkap; cukup kosong di sini.
  jest.spyOn(service, 'findOne').mockResolvedValue({} as never);
  return { service, client, audit };
}

const args = (mock: { mock: { calls: QueryArgs[][] } }, index = 0) =>
  mock.mock.calls[index][0];

describe('KpiReviewsService.saveScores', () => {
  const body = {
    scores: [
      { indicatorId: I1, score: '90', note: 'Rilis tepat waktu' },
      { indicatorId: I2, score: '77.5' },
    ],
    note: 'Pertahankan',
  };

  it('kunci review, timpa skor (Decimal), catat reviewer dari JWT', async () => {
    const { service, client } = setup();

    await service.saveScores(REVIEW, body, hr);

    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    expect(args(client.kpiScore.update)).toEqual({
      where: { reviewId_indicatorId: { reviewId: REVIEW, indicatorId: I1 } },
      data: { score: d('90'), note: 'Rilis tepat waktu' },
    });
    expect(args(client.kpiScore.update, 1).data).toEqual({
      score: d('77.5'),
      note: null,
    });
    expect(args(client.kpiReview.update)).toEqual({
      where: { id: REVIEW },
      data: { note: 'Pertahankan', reviewerId: 'user-hr' },
    });
  });

  it('indikator terlewat: 422 tanpa menyimpan apa pun', async () => {
    const { service, client } = setup();

    await expect(
      service.saveScores(REVIEW, { scores: [body.scores[0]] }, hr),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(client.kpiScore.update).not.toHaveBeenCalled();
  });

  it('review FINAL: skor terkunci (409)', async () => {
    const { service, client } = setup();
    client.$queryRaw.mockResolvedValue([locked({ status: 'FINAL' })]);

    await expect(service.saveScores(REVIEW, body, hr)).rejects.toThrow(
      new ConflictException(KpiMessages.reviewFinal),
    );
    expect(client.kpiScore.update).not.toHaveBeenCalled();
  });

  it('periode tidak ACTIVE: 409; review milik HR itu sendiri: 403; tidak ada: 404', async () => {
    const { service, client } = setup();
    client.$queryRaw.mockResolvedValueOnce([
      locked({ periodStatus: 'CLOSED' }),
    ]);
    await expect(service.saveScores(REVIEW, body, hr)).rejects.toThrow(
      new ConflictException(KpiMessages.periodNotActive('Q1 2026')),
    );

    client.$queryRaw.mockResolvedValueOnce([
      locked({ employeeUserId: 'user-hr' }),
    ]);
    await expect(service.saveScores(REVIEW, body, hr)).rejects.toThrow(
      ForbiddenException,
    );

    client.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.saveScores(REVIEW, body, hr)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('KpiReviewsService.finalize', () => {
  it('nilai akhir = 90 x 0,6 + 77,5 x 0,4 = 85,0 -> A, status FINAL + audit', async () => {
    const { service, client, audit } = setup();

    await service.finalize(REVIEW, hr);

    expect(args(client.kpiReview.update)).toEqual({
      where: { id: REVIEW },
      data: {
        status: 'FINAL',
        finalScore: d('85'),
        grade: 'A',
        finalizedAt: NOW,
        reviewerId: 'user-hr',
      },
    });
    expect(audit.recordChange.mock.calls[0][0]).toEqual({
      entity: 'KpiReview',
      entityId: REVIEW,
      before: { periodId: 'period-1', employeeId: 'emp-1', status: 'DRAFT' },
      after: {
        periodId: 'period-1',
        employeeId: 'emp-1',
        status: 'FINAL',
        finalScore: '85.0',
        grade: 'A',
        finalizedAt: NOW,
      },
    });
  });

  it('masih ada skor kosong: 422', async () => {
    const { service, client } = setup();
    client.kpiScore.findMany.mockResolvedValue([
      { score: d('90'), weight: d('60') },
      { score: null, weight: d('40') },
    ]);

    await expect(service.finalize(REVIEW, hr)).rejects.toThrow(
      new UnprocessableEntityException(KpiMessages.scoresIncomplete(1, 2)),
    );
    expect(client.kpiReview.update).not.toHaveBeenCalled();
  });

  it('sudah FINAL: tidak bisa difinalkan lagi (409)', async () => {
    const { service, client } = setup();
    client.$queryRaw.mockResolvedValue([locked({ status: 'FINAL' })]);

    await expect(service.finalize(REVIEW, hr)).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('KpiReviewsService.list', () => {
  it('filter periode, departemen, status + pagination', async () => {
    const { service, client } = setup();

    await expect(
      service.list({
        periodId: 'period-1',
        departmentId: 'dept-it',
        status: 'DRAFT',
        page: 2,
        limit: 10,
      }),
    ).resolves.toEqual({
      data: [],
      meta: { page: 2, limit: 10, total: 0, totalPages: 0 },
    });
    expect(args(client.kpiReview.findMany)).toMatchObject({
      where: { periodId: 'period-1', departmentId: 'dept-it', status: 'DRAFT' },
      skip: 10,
      take: 10,
    });
  });
});
