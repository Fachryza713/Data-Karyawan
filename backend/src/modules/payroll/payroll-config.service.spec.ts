import { jest } from '@jest/globals';
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type QueryArgs, queryMock } from '../../../test/fixtures/employees.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import { PayrollConfigService } from './payroll-config.service.js';
import { PayrollMessages } from './payroll.constants.js';

const d = (value: string) => new Prisma.Decimal(value);
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const NOW = new Date('2026-11-26T03:00:00.000Z');

const row = (
  key: string,
  effectiveFrom: string,
  employeeRate: string,
  wageCap: string | null = null,
) => ({
  id: `${key}-${effectiveFrom}`,
  key,
  employeeRate: d(employeeRate),
  employerRate: d('0.02'),
  wageCap: wageCap ? d(wageCap) : null,
  effectiveFrom: day(effectiveFrom),
  createdAt: NOW,
});

// Urut key, lalu effectiveFrom turun (seperti query service).
const ROWS = [
  row('BPJS_KES', '2025-03-01', '0.01', '12000000'),
  row('JHT', '2025-03-01', '0.02'),
  row('JKK', '2025-03-01', '0'),
  row('JKM', '2025-03-01', '0'),
  row('JP', '2027-03-01', '0.01', '11000000'),
  row('JP', '2025-03-01', '0.01', '10547400'),
];

function knownError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('prisma error', {
    code,
    clientVersion: Prisma.prismaVersion.client,
  });
}

function setup() {
  const client = {
    payrollConfig: {
      findMany: queryMock().mockResolvedValue(ROWS),
      create: queryMock().mockImplementation((args) =>
        Promise.resolve({
          id: 'new',
          createdAt: NOW,
          ...(args.data as object),
        }),
      ),
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
  const service = new PayrollConfigService(
    { client } as unknown as PrismaService,
    audit as unknown as AuditService,
    { now: () => NOW },
  );
  return { service, client, audit };
}

const firstArgs = (mock: { mock: { calls: QueryArgs[][] } }) =>
  mock.mock.calls[0][0];

describe('PayrollConfigService', () => {
  it('list: current = tarif berlaku hari ini, tarif masa depan hanya di history', async () => {
    const { service } = setup();

    const result = await service.list({});

    expect(result.date).toBe('2026-11-26');
    const jp = result.current.find((config) => config.key === 'JP');
    expect(jp).toMatchObject({
      wageCap: '10547400.00',
      employeeRate: '0.0100',
    });
    expect(result.current).toHaveLength(5);
    expect(result.history).toHaveLength(6);
  });

  it('update: baris baru per program (create, bukan update), audit before = tarif sebelumnya', async () => {
    const { service, client, audit } = setup();

    await service.update({
      effectiveFrom: '2026-03-01',
      configs: [
        {
          key: 'JP',
          employeeRate: '0.01',
          employerRate: '0.02',
          wageCap: '10800000',
        },
      ],
    });

    const data = firstArgs(client.payrollConfig.create).data!;
    expect(data).toMatchObject({ key: 'JP', effectiveFrom: day('2026-03-01') });
    expect((data.wageCap as Prisma.Decimal).toFixed(2)).toBe('10800000.00');
    expect(Prisma.Decimal.isDecimal(data.employeeRate)).toBe(true);
    expect(client.payrollConfig).not.toHaveProperty('update');
    expect(audit.recordChange.mock.calls[0][0]).toMatchObject({
      entity: 'PayrollConfig',
      entityId: '2026-03-01',
      before: { JP: { wageCap: '10547400.00', effectiveFrom: '2025-03-01' } },
      after: { JP: { wageCap: '10800000.00', effectiveFrom: '2026-03-01' } },
    });
  });

  it('program + tanggal yang sudah ada: 409 (tarif lama tidak ditimpa)', async () => {
    const { service, client } = setup();
    client.payrollConfig.create.mockRejectedValue(knownError('P2002'));

    await expect(
      service.update({
        effectiveFrom: '2025-03-01',
        configs: [
          {
            key: 'JHT',
            employeeRate: '0.02',
            employerRate: '0.037',
            wageCap: null,
          },
        ],
      }),
    ).rejects.toThrow(new ConflictException(PayrollMessages.configExists));
  });

  it('aturan input dicek sebelum menulis (tanggal 1, JKK tanpa bagian karyawan)', async () => {
    const { service, client } = setup();

    await expect(
      service.update({
        effectiveFrom: '2026-03-15',
        configs: [
          {
            key: 'JP',
            employeeRate: '0.01',
            employerRate: '0.02',
            wageCap: null,
          },
        ],
      }),
    ).rejects.toThrow(UnprocessableEntityException);
    await expect(
      service.update({
        effectiveFrom: '2026-03-01',
        configs: [
          {
            key: 'JKK',
            employeeRate: '0.001',
            employerRate: '0.0024',
            wageCap: null,
          },
        ],
      }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(client.payrollConfig.create).not.toHaveBeenCalled();
  });

  it('ratesOn: tarif untuk awal bulan periode', async () => {
    const { service } = setup();

    const resolved = await service.ratesOn('2027-03-01');

    expect(resolved.rates.JP.wageCap?.toFixed(0)).toBe('11000000');
  });
});
