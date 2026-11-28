import { jest } from '@jest/globals';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { queryMock } from '../../../test/fixtures/employees.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import { PayrollMessages } from './payroll.constants.js';
import { PayrollPeriodsService } from './payroll-periods.service.js';

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
      ]),
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
  const service = new PayrollPeriodsService(
    { client } as unknown as PrismaService,
    audit as unknown as AuditService,
    { now: () => NOW },
  );
  // findOne() setelah transisi memakai select slip lengkap; cukup kosong.
  const detail = jest.spyOn(service, 'findOne').mockResolvedValue({} as never);
  return { service, client, audit, detail };
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
      after: { status: 'FINAL', finalizedById: hr.id, itemCount: 1 },
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
