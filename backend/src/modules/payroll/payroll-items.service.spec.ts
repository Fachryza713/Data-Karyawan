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
import { PayrollItemsService } from './payroll-items.service.js';

const d = (value: string) => new Prisma.Decimal(value);
const ITEM = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e81';
const PERIOD = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e80';

/** Slip upah 9.000.000 tanpa isian HR (BPJS 90.000 + 180.000 + 90.000). */
const itemRow = {
  id: ITEM,
  periodId: PERIOD,
  employeeId: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e10',
  employeeName: 'Raditya Pratama',
  nip: 'BRT-2024-0001',
  departmentName: 'Teknologi Informasi',
  positionName: 'Frontend Developer',
  bankName: 'BCA',
  bankAccountLast4: '8821',
  baseSalary: d('8000000'),
  fixedAllowance: d('1000000'),
  bonus: d('0'),
  gross: d('9000000'),
  bpjsKes: d('90000'),
  bpjsJht: d('180000'),
  bpjsJp: d('90000'),
  pph21: d('0'),
  otherDeductions: d('0'),
  net: d('8640000'),
  employerContributions: {
    BPJS_KES: '360000.00',
    JHT: '333000.00',
    JP: '180000.00',
    JKK: '21600.00',
    JKM: '27000.00',
    total: '921600.00',
  },
  configSnapshot: {},
  note: 'lama',
  updatedAt: new Date('2026-11-26T03:00:00.000Z'),
};

function setup(status: 'DRAFT' | 'FINAL' | 'PAID' = 'DRAFT') {
  const client = {
    $executeRaw: jest
      .fn<(...args: unknown[]) => Promise<number>>()
      .mockResolvedValue(1),
    payrollItem: {
      findUnique: queryMock().mockResolvedValue({ periodId: PERIOD }),
      findUniqueOrThrow: queryMock().mockResolvedValue(itemRow),
      update: queryMock().mockImplementation((args) =>
        Promise.resolve({ ...itemRow, ...args.data }),
      ),
    },
    payrollPeriod: {
      findUniqueOrThrow: queryMock().mockResolvedValue({
        period: '2026-11',
        status,
      }),
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
  const service = new PayrollItemsService(
    { client } as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  return { service, client, audit };
}

const updateData = (mock: { mock: { calls: QueryArgs[][] } }) =>
  mock.mock.calls[0][0].data as Record<string, Prisma.Decimal | string | null>;

describe('PayrollItemsService.update', () => {
  it('bonus dan PPh 21: bruto dan net dihitung ulang, audit before/after', async () => {
    const { service, client, audit } = setup();

    const result = await service.update(ITEM, {
      bonus: '1500000',
      pph21: '250000',
    });

    const data = updateData(client.payrollItem.update);
    expect((data.gross as Prisma.Decimal).toFixed(2)).toBe('10500000.00');
    // 10.500.000 - 360.000 - 250.000
    expect((data.net as Prisma.Decimal).toFixed(2)).toBe('9890000.00');
    expect(result).toMatchObject({ bonus: '1500000.00', net: '9890000.00' });
    expect(audit.recordChange.mock.calls[0][0]).toEqual({
      entity: 'PayrollItem',
      entityId: ITEM,
      before: {
        period: '2026-11',
        bonus: '0.00',
        pph21: '0.00',
        gross: '9000000.00',
        net: '8640000.00',
      },
      after: {
        period: '2026-11',
        bonus: '1500000.00',
        pph21: '250000.00',
        gross: '10500000.00',
        net: '9890000.00',
      },
    });
  });

  it('lock periode diambil sebelum membaca status', async () => {
    const { service, client } = setup();

    await service.update(ITEM, { bonus: '1' });

    expect(client.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      client.payrollPeriod.findUniqueOrThrow.mock.invocationCallOrder[0],
    );
  });

  it('note null mengosongkan catatan; field lain tetap', async () => {
    const { service, client } = setup();

    await service.update(ITEM, { note: null });

    const data = updateData(client.payrollItem.update);
    expect(data.note).toBeNull();
    expect((data.bonus as Prisma.Decimal).toFixed(2)).toBe('0.00');
  });

  it('tanpa perubahan: tidak menulis dan tidak audit', async () => {
    const { service, client, audit } = setup();

    await service.update(ITEM, { bonus: '0.00', note: 'lama' });

    expect(client.payrollItem.update).not.toHaveBeenCalled();
    expect(audit.recordChange).not.toHaveBeenCalled();
  });

  it('take home pay negatif: 422', async () => {
    const { service, client } = setup();

    await expect(
      service.update(ITEM, { otherDeductions: '9000000' }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(client.payrollItem.update).not.toHaveBeenCalled();
  });

  it.each(['FINAL', 'PAID'] as const)('periode %s: 409', async (status) => {
    const { service, client } = setup(status);

    await expect(service.update(ITEM, { bonus: '1' })).rejects.toThrow(
      ConflictException,
    );
    expect(client.payrollItem.update).not.toHaveBeenCalled();
  });

  it('slip tidak ada: 404', async () => {
    const { service, client } = setup();
    client.payrollItem.findUnique.mockResolvedValue(null);

    await expect(service.update(ITEM, { bonus: '1' })).rejects.toThrow(
      NotFoundException,
    );
  });
});
