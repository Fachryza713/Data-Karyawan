import { jest } from '@jest/globals';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { queryMock } from '../../../test/fixtures/employees.js';
import { FakeQueue } from '../../../test/fixtures/queue.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { PayrollMessages } from './payroll.constants.js';
import { PayrollPeriodsService } from './payroll-periods.service.js';
import {
  PayslipPdfQueue,
  type PayslipQueueClient,
} from './payslip-pdf.queue.js';
import { PayslipPdfService } from './payslip-pdf.service.js';

const d = (value: string) => new Prisma.Decimal(value);
const PERIOD = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e80';
const NOW = new Date('2026-11-26T03:00:00.000Z');
const hr: AuthUser = {
  id: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e99',
  role: 'HR',
  employeeId: null,
};

const periodRow = (status: 'DRAFT' | 'FINAL' | 'PAID') => ({
  id: PERIOD,
  period: '2026-11',
  status,
  finalizedAt: status === 'DRAFT' ? null : NOW,
  paidAt: status === 'PAID' ? NOW : null,
  createdAt: NOW,
  updatedAt: NOW,
  finalizedBy: null,
});

function knownError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('prisma error', {
    code,
    clientVersion: Prisma.prismaVersion.client,
  });
}

function setup(status: 'DRAFT' | 'FINAL' | 'PAID' = 'DRAFT') {
  const client = {
    $executeRaw: jest
      .fn<(...args: unknown[]) => Promise<number>>()
      .mockResolvedValue(1),
    payrollPeriod: {
      create: queryMock().mockResolvedValue(periodRow('DRAFT')),
      findMany: queryMock().mockResolvedValue([periodRow(status)]),
      findUnique: queryMock().mockResolvedValue({
        ...periodRow(status),
        finalizedById: status === 'DRAFT' ? null : hr.id,
      }),
      updateMany: queryMock().mockResolvedValue({ count: 1 }),
    },
    payrollItem: {
      findMany: queryMock().mockResolvedValue([
        {
          id: 'item-1',
          nip: 'BRT-2024-0001',
          employeeName: 'A',
          net: d('100'),
        },
        {
          id: 'item-2',
          nip: 'BRT-2024-0002',
          employeeName: 'B',
          net: d('200'),
        },
      ]),
      groupBy: queryMock().mockResolvedValue([]),
      updateMany: queryMock().mockResolvedValue({ count: 2 }),
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
  const storage = {
    delete: jest.fn<StorageService['delete']>().mockResolvedValue(undefined),
  };
  // PayslipPdfService dan producer asli; hanya Queue BullMQ yang palsu
  // (FakeQueue meniru aturan jobId BullMQ).
  const queue = new FakeQueue('payslip-pdf');
  const payslipPdf = new PayslipPdfService(
    { client } as unknown as PrismaService,
    audit as unknown as AuditService,
    new PayslipPdfQueue(queue as unknown as PayslipQueueClient),
    storage as unknown as StorageService,
  );
  const service = new PayrollPeriodsService(
    { client } as unknown as PrismaService,
    audit as unknown as AuditService,
    { now: () => NOW },
    payslipPdf,
  );
  // findOne() setelah transisi memakai select slip lengkap; cukup kosong.
  const detail = jest.spyOn(service, 'findOne').mockResolvedValue({} as never);
  return { service, client, audit, detail, queue, storage };
}

describe('PayrollPeriodsService.create', () => {
  it('periode DRAFT baru + audit', async () => {
    const { service, client, audit } = setup();

    const result = await service.create({ period: '2026-12' });

    expect(client.payrollPeriod.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { period: '2026-12' } }),
    );
    expect(audit.recordChange.mock.calls[0][0]).toMatchObject({
      entity: 'PayrollPeriod',
      after: { period: '2026-11', status: 'DRAFT' },
    });
    expect(result).toMatchObject({
      status: 'DRAFT',
      itemCount: 0,
      totalNet: '0.00',
    });
  });

  it('lebih jauh dari bulan depan: 422; sudah ada: 409', async () => {
    const { service, client } = setup();

    await expect(service.create({ period: '2027-01' })).rejects.toThrow(
      UnprocessableEntityException,
    );
    client.payrollPeriod.create.mockRejectedValue(knownError('P2002'));
    await expect(service.create({ period: '2026-11' })).rejects.toThrow(
      new ConflictException(PayrollMessages.periodExists),
    );
  });
});

describe('PayrollPeriodsService transisi status', () => {
  it('finalize: lock, cek slip, updateMany bersyarat DRAFT, audit before/after', async () => {
    const { service, client, audit } = setup('DRAFT');

    await service.finalize(PERIOD, hr);

    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
    expect(client.payrollPeriod.updateMany).toHaveBeenCalledWith({
      where: { id: PERIOD, status: 'DRAFT' },
      data: { finalizedById: hr.id, finalizedAt: NOW, status: 'FINAL' },
    });
    expect(audit.recordChange.mock.calls[0][0]).toMatchObject({
      before: { status: 'DRAFT', finalizedById: null },
      after: { status: 'FINAL', finalizedById: hr.id, itemCount: 2 },
    });
  });

  it('finalize tanpa slip atau dengan take home pay negatif: 422', async () => {
    const empty = setup('DRAFT');
    empty.client.payrollItem.findMany.mockResolvedValue([]);
    await expect(empty.service.finalize(PERIOD, hr)).rejects.toThrow(
      UnprocessableEntityException,
    );

    const negative = setup('DRAFT');
    negative.client.payrollItem.findMany.mockResolvedValue([
      { id: 'x', nip: 'BRT-2024-0001', employeeName: 'A', net: d('-1') },
    ]);
    await expect(negative.service.finalize(PERIOD, hr)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(negative.client.payrollPeriod.updateMany).not.toHaveBeenCalled();
  });

  it('mark-paid: FINAL -> PAID dengan paidAt', async () => {
    const { service, client } = setup('FINAL');

    await service.markPaid(PERIOD);

    expect(client.payrollPeriod.updateMany).toHaveBeenCalledWith({
      where: { id: PERIOD, status: 'FINAL' },
      data: { paidAt: NOW, status: 'PAID' },
    });
  });

  it('reopen: FINAL -> DRAFT, finalized dikosongkan, alasan di audit', async () => {
    const { service, client, audit } = setup('FINAL');

    await service.reopen(PERIOD, 'Koreksi bonus');

    expect(client.payrollPeriod.updateMany).toHaveBeenCalledWith({
      where: { id: PERIOD, status: 'FINAL' },
      data: { finalizedById: null, finalizedAt: null, status: 'DRAFT' },
    });
    expect(audit.recordChange.mock.calls[0][0]).toMatchObject({
      before: { status: 'FINAL' },
      after: { status: 'DRAFT', reason: 'Koreksi bonus' },
    });
  });

  it.each([
    ['finalize', 'FINAL'],
    ['finalize', 'PAID'],
    ['markPaid', 'DRAFT'],
    ['markPaid', 'PAID'],
    ['reopen', 'DRAFT'],
    ['reopen', 'PAID'],
  ] as const)('%s dari %s: 409 tanpa update', async (action, status) => {
    const { service, client } = setup(status);
    const call = {
      finalize: () => service.finalize(PERIOD, hr),
      markPaid: () => service.markPaid(PERIOD),
      reopen: () => service.reopen(PERIOD, 'x'),
    }[action];

    await expect(call()).rejects.toThrow(ConflictException);
    expect(client.payrollPeriod.updateMany).not.toHaveBeenCalled();
  });

  it('reopen periode PAID: pesan tidak bisa dibuka lagi', async () => {
    const { service } = setup('PAID');

    await expect(service.reopen(PERIOD, 'x')).rejects.toThrow(
      new ConflictException(PayrollMessages.paidIsFinal),
    );
  });

  it('status berubah di antara cek dan update (count 0): 409, tanpa audit', async () => {
    const { service, client, audit } = setup('FINAL');
    client.payrollPeriod.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.markPaid(PERIOD)).rejects.toThrow(
      new ConflictException(PayrollMessages.alreadyChanged),
    );
    expect(audit.recordChange).not.toHaveBeenCalled();
  });

  it('periode tidak ada: 404', async () => {
    const { service, client } = setup();
    client.payrollPeriod.findUnique.mockResolvedValue(null);

    await expect(service.markPaid(PERIOD)).rejects.toThrow(NotFoundException);
  });
});

describe('PayrollPeriodsService: PDF slip saat finalize dan reopen', () => {
  const itemIds = ['item-1', 'item-2'];

  it('finalize: slip QUEUED di transaksi yang sama, lalu satu job per slip (jobId = itemId) setelah commit', async () => {
    const { service, client, queue } = setup('DRAFT');

    await service.finalize(PERIOD, hr);

    expect(client.payrollItem.updateMany).toHaveBeenCalledWith({
      where: { periodId: PERIOD },
      data: { slipStatus: 'QUEUED', slipKey: null, slipError: null },
    });
    // Job baru dimasukkan setelah status periode berubah (setelah commit).
    expect(
      client.payrollPeriod.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(queue.addBulk.mock.invocationCallOrder[0]);
    expect([...queue.jobs.values()].map((job) => [job.id, job.data])).toEqual(
      itemIds.map((itemId) => [itemId, { itemId, notify: true }]),
    );
  });

  it('finalize dua kali tidak menggandakan job', async () => {
    const { service, client, queue } = setup('DRAFT');

    await service.finalize(PERIOD, hr);
    // Panggilan kedua ditolak status FINAL (409) sebelum menyentuh queue.
    client.payrollPeriod.findUnique.mockResolvedValue({
      ...periodRow('FINAL'),
      finalizedById: hr.id,
    });
    await expect(service.finalize(PERIOD, hr)).rejects.toThrow(
      ConflictException,
    );

    expect(queue.addBulk).toHaveBeenCalledTimes(1);
    expect(queue.jobs.size).toBe(2);
  });

  it('finalize dua kali yang sama-sama sampai ke enqueue (balapan/retry): tetap satu job per slip', async () => {
    const { service, queue } = setup('DRAFT');

    // Mock database tetap DRAFT, jadi kedua panggilan memasukkan job.
    await Promise.all([
      service.finalize(PERIOD, hr),
      service.finalize(PERIOD, hr),
    ]);

    expect(queue.requested).toHaveLength(4);
    expect([...queue.jobs.keys()]).toEqual(itemIds);
  });

  it('Redis mati saat finalize: request tetap selesai, slip ditandai FAILED', async () => {
    const { service, client, queue } = setup('DRAFT');
    queue.getJob.mockRejectedValue(new Error('connect ECONNREFUSED'));

    // findOne() di-mock {}: finalize mengembalikan detail periode, bukan error.
    await expect(service.finalize(PERIOD, hr)).resolves.toEqual({});

    expect(client.payrollPeriod.updateMany).toHaveBeenCalled();
    expect(client.payrollItem.updateMany).toHaveBeenLastCalledWith({
      where: { id: { in: itemIds }, slipStatus: 'QUEUED' },
      data: {
        slipStatus: 'FAILED',
        slipError:
          'Gagal menambahkan slip ke antrean PDF: connect ECONNREFUSED',
      },
    });
  });

  it('reopen: slip kembali NONE di transaksi yang sama, PDF lama dihapus setelah commit', async () => {
    const { service, client, storage } = setup('FINAL');
    client.payrollItem.findMany.mockResolvedValue([
      { employeeId: 'emp-1', slipKey: 'payslips/2026-11/emp-1.pdf' },
      { employeeId: 'emp-2', slipKey: null },
    ]);

    await service.reopen(PERIOD, 'Koreksi bonus');

    expect(client.payrollItem.updateMany).toHaveBeenCalledWith({
      where: { periodId: PERIOD },
      data: { slipStatus: 'NONE', slipKey: null, slipError: null },
    });
    expect(storage.delete.mock.calls.map(([key]) => key)).toEqual([
      'payslips/2026-11/emp-1.pdf',
      'payslips/2026-11/emp-2.pdf',
    ]);
    expect(
      client.payrollPeriod.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(storage.delete.mock.invocationCallOrder[0]);
  });

  it('reopen tetap berhasil walau sebagian PDF gagal dihapus', async () => {
    const { service, client, storage } = setup('FINAL');
    client.payrollItem.findMany.mockResolvedValue([
      { employeeId: 'emp-1', slipKey: null },
    ]);
    storage.delete.mockRejectedValue(new Error('MinIO down'));

    await expect(service.reopen(PERIOD, 'x')).resolves.toBeDefined();
  });

  it('reopen yang ditolak (PAID) tidak menyentuh status slip dan file', async () => {
    const { service, client, storage } = setup('PAID');

    await expect(service.reopen(PERIOD, 'x')).rejects.toThrow(
      ConflictException,
    );
    expect(client.payrollItem.updateMany).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });
});

describe('PayrollPeriodsService.list', () => {
  it('jumlah slip dan total net per periode dari groupBy', async () => {
    const { service, client } = setup('FINAL');
    client.payrollItem.groupBy.mockResolvedValue([
      {
        periodId: PERIOD,
        _count: { _all: 29 },
        _sum: { net: d('254000000.5') },
      },
    ]);

    await expect(service.list({})).resolves.toEqual([
      expect.objectContaining({ itemCount: 29, totalNet: '254000000.50' }),
    ]);
  });
});
