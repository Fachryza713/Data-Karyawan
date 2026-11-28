import { jest } from '@jest/globals';
import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { type QueryArgs, queryMock } from '../../../test/fixtures/employees.js';
import { FakeQueue } from '../../../test/fixtures/queue.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { PayrollMessages } from './payroll.constants.js';
import {
  PayslipPdfQueue,
  type PayslipQueueClient,
} from './payslip-pdf.queue.js';
import { PayslipPdfService } from './payslip-pdf.service.js';

const PERIOD = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e80';

function setup(status: 'DRAFT' | 'FINAL' | 'PAID' = 'FINAL') {
  const client = {
    $executeRaw: jest
      .fn<(...args: unknown[]) => Promise<number>>()
      .mockResolvedValue(1),
    payrollPeriod: {
      findUnique: queryMock().mockResolvedValue({
        id: PERIOD,
        period: '2026-11',
        status,
      }),
    },
    payrollItem: {
      findMany: queryMock().mockResolvedValue([
        { id: 'item-1', slipStatus: 'FAILED' },
        { id: 'item-2', slipStatus: 'READY' },
      ]),
      updateMany: queryMock().mockResolvedValue({ count: 2 }),
      groupBy: queryMock().mockResolvedValue([]),
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
  const queue = new FakeQueue('payslip-pdf');
  const storage = {
    delete: jest.fn<StorageService['delete']>().mockResolvedValue(undefined),
  };
  const service = new PayslipPdfService(
    { client } as unknown as PrismaService,
    audit as unknown as AuditService,
    new PayslipPdfQueue(queue as unknown as PayslipQueueClient),
    storage as unknown as StorageService,
  );
  return { service, client, audit, queue };
}

const args = (mock: { mock: { calls: QueryArgs[][] } }, index = 0) =>
  mock.mock.calls[index][0];

describe('PayslipPdfService.regenerate', () => {
  it('scope FAILED: hanya slip FAILED, di bawah lock periode, lalu masuk antrean', async () => {
    const { service, client, queue, audit } = setup('FINAL');
    client.payrollItem.findMany.mockResolvedValue([
      { id: 'item-1', slipStatus: 'FAILED' },
    ]);

    await expect(service.regenerate(PERIOD, 'FAILED')).resolves.toEqual({
      periodId: PERIOD,
      scope: 'FAILED',
      queued: 1,
    });

    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
    expect(args(client.payrollItem.findMany).where).toEqual({
      periodId: PERIOD,
      slipStatus: 'FAILED',
    });
    expect(args(client.payrollItem.updateMany)).toEqual({
      where: { id: { in: ['item-1'] } },
      data: { slipStatus: 'QUEUED', slipError: null },
    });
    expect(audit.recordChange.mock.calls[0][0]).toMatchObject({
      entity: 'PayrollPeriod',
      entityId: PERIOD,
      after: { period: '2026-11', scope: 'FAILED', queued: 1 },
    });
    expect([...queue.jobs.values()].map((job) => job.data)).toEqual([
      { itemId: 'item-1', notify: true },
    ]);
  });

  it('scope ALL: semua slip; slip yang sudah READY dibuat ulang tanpa email', async () => {
    const { service, client, queue } = setup('PAID');

    await service.regenerate(PERIOD, 'ALL');

    expect(args(client.payrollItem.findMany).where).toEqual({
      periodId: PERIOD,
    });
    expect([...queue.jobs.values()].map((job) => job.data)).toEqual([
      { itemId: 'item-1', notify: true },
      { itemId: 'item-2', notify: false },
    ]);
  });

  it('job slip yang masih berjalan tidak digandakan oleh regenerate', async () => {
    const { service, queue } = setup('FINAL');

    await service.regenerate(PERIOD, 'ALL');
    queue.finish('item-1', 'active');
    await service.regenerate(PERIOD, 'ALL');

    expect(queue.jobs.size).toBe(2);
  });

  it('periode DRAFT: 409 tanpa mengubah slip; periode tidak ada: 404', async () => {
    const draft = setup('DRAFT');
    await expect(draft.service.regenerate(PERIOD, 'ALL')).rejects.toThrow(
      new ConflictException(PayrollMessages.slipsNotPublished),
    );
    expect(draft.client.payrollItem.updateMany).not.toHaveBeenCalled();
    expect(draft.queue.addBulk).not.toHaveBeenCalled();

    const missing = setup();
    missing.client.payrollPeriod.findUnique.mockResolvedValue(null);
    await expect(missing.service.regenerate(PERIOD, 'ALL')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('tidak ada slip FAILED: 0 slip, Redis tidak disentuh', async () => {
    const { service, client, queue } = setup();
    client.payrollItem.findMany.mockResolvedValue([]);

    await expect(service.regenerate(PERIOD, 'FAILED')).resolves.toMatchObject({
      queued: 0,
    });
    expect(client.payrollItem.updateMany).not.toHaveBeenCalled();
    expect(queue.getJob).not.toHaveBeenCalled();
  });

  it('antrean tidak tersedia: slip kembali FAILED dan 503', async () => {
    const { service, client, queue } = setup();
    queue.addBulk.mockRejectedValue(new Error('READONLY'));

    await expect(service.regenerate(PERIOD, 'ALL')).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(args(client.payrollItem.updateMany, 1)).toEqual({
      where: { id: { in: ['item-1', 'item-2'] }, slipStatus: 'QUEUED' },
      data: {
        slipStatus: 'FAILED',
        slipError: 'Gagal menambahkan slip ke antrean PDF: READONLY',
      },
    });
  });
});

describe('PayslipPdfService.status', () => {
  it('jumlah per slipStatus (yang tidak ada = 0) dan daftar slip FAILED', async () => {
    const { service, client } = setup('FINAL');
    client.payrollItem.groupBy.mockResolvedValue([
      { slipStatus: 'READY', _count: { _all: 27 } },
      { slipStatus: 'FAILED', _count: { _all: 1 } },
    ]);
    client.payrollItem.findMany.mockResolvedValue([
      {
        id: 'item-9',
        employeeId: 'emp-9',
        nip: 'BRT-2024-0009',
        employeeName: 'Citra',
        slipError: 'MinIO timeout',
      },
    ]);

    await expect(service.status(PERIOD)).resolves.toEqual({
      periodId: PERIOD,
      period: '2026-11',
      status: 'FINAL',
      total: 28,
      counts: { NONE: 0, QUEUED: 0, READY: 27, FAILED: 1 },
      failed: [
        {
          itemId: 'item-9',
          employeeId: 'emp-9',
          nip: 'BRT-2024-0009',
          employeeName: 'Citra',
          error: 'MinIO timeout',
        },
      ],
    });
    expect(args(client.payrollItem.groupBy)).toMatchObject({
      where: { periodId: PERIOD },
    });
  });

  it('periode tidak ada: 404', async () => {
    const { service, client } = setup();
    client.payrollPeriod.findUnique.mockResolvedValue(null);

    await expect(service.status(PERIOD)).rejects.toThrow(NotFoundException);
  });
});
