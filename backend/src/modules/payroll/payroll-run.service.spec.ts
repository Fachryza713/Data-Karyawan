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
import type { PayrollConfigService } from './payroll-config.service.js';
import type { ResolvedRates } from './payroll-rules.js';
import { PayrollRunService } from './payroll-run.service.js';

const d = (value: string) => new Prisma.Decimal(value);
const PERIOD = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e80';
const ALICE = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e10';
const BUDI = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e12';
const CITRA = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e13';
const NOW = new Date('2026-11-26T03:00:00.000Z');

function configRow(
  key: string,
  employeeRate: string,
  employerRate: string,
  cap: string | null,
) {
  return {
    key,
    employeeRate: d(employeeRate),
    employerRate: d(employerRate),
    wageCap: cap ? d(cap) : null,
    effectiveFrom: new Date('2025-03-01T00:00:00.000Z'),
  };
}
const ROWS = {
  BPJS_KES: configRow('BPJS_KES', '0.01', '0.04', '12000000'),
  JHT: configRow('JHT', '0.02', '0.037', null),
  JP: configRow('JP', '0.01', '0.02', '10547400'),
  JKK: configRow('JKK', '0', '0.0024', null),
  JKM: configRow('JKM', '0', '0.003', null),
};
const RESOLVED = {
  rows: ROWS,
  rates: Object.fromEntries(
    Object.entries(ROWS).map(([key, row]) => [
      key,
      {
        employeeRate: row.employeeRate,
        employerRate: row.employerRate,
        wageCap: row.wageCap,
      },
    ]),
  ),
} as unknown as ResolvedRates;

const employee = (id: string, nip: string, base: string | null) => ({
  id,
  nip,
  fullName: `Karyawan ${nip}`,
  department: { name: 'Teknologi Informasi' },
  position: { name: 'Backend Developer' },
  salaries: base
    ? [
        {
          baseSalary: d(base),
          fixedAllowance: d('1000000'),
          bankName: 'BCA',
          bankAccountLast4: '1234',
        },
      ]
    : [],
});

const EMPLOYER_JSON = {
  BPJS_KES: '0.00',
  JHT: '0.00',
  JP: '0.00',
  JKK: '0.00',
  JKM: '0.00',
  total: '0.00',
};

/** Slip yang sudah ada dengan isian HR. */
const existingItem = (employeeId: string) => ({
  employeeId,
  baseSalary: d('1'),
  fixedAllowance: d('0'),
  bonus: d('1500000'),
  gross: d('1500001'),
  bpjsKes: d('0'),
  bpjsJht: d('0'),
  bpjsJp: d('0'),
  pph21: d('250000'),
  otherDeductions: d('50000'),
  net: d('1200001'),
  employerContributions: EMPLOYER_JSON,
});

function setup(
  status: 'DRAFT' | 'FINAL' | 'PAID' = 'DRAFT',
  existing: unknown[] = [],
) {
  const upserted: QueryArgs[] = [];
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
      findUniqueOrThrow: queryMock().mockResolvedValue({
        id: PERIOD,
        period: '2026-11',
        status,
        finalizedAt: null,
        paidAt: null,
        createdAt: NOW,
        updatedAt: NOW,
        finalizedBy: null,
      }),
    },
    employee: {
      findMany: queryMock().mockResolvedValue([
        employee(ALICE, 'BRT-2024-0001', '8000000'),
        employee(BUDI, 'BRT-2024-0002', '13500000'),
        employee(CITRA, 'BRT-2024-0003', null),
      ]),
    },
    payrollItem: {
      findMany: queryMock().mockResolvedValue(existing),
      upsert: queryMock().mockImplementation((args) => {
        upserted.push(args);
        return Promise.resolve({});
      }),
      deleteMany: queryMock().mockResolvedValue({ count: 0 }),
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
  const configs = {
    ratesOn: jest
      .fn<PayrollConfigService['ratesOn']>()
      .mockResolvedValue(RESOLVED),
  };
  const service = new PayrollRunService(
    { client } as unknown as PrismaService,
    audit as unknown as AuditService,
    configs as unknown as PayrollConfigService,
  );
  return { service, client, audit, configs, upserted };
}

describe('PayrollRunService.run', () => {
  it('advisory lock per periode diambil di transaksi sebelum membaca status', async () => {
    const { service, client } = setup();

    await service.run(PERIOD);

    const [sql, key] = client.$executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    expect(sql.join('?')).toContain(
      'pg_advisory_xact_lock(hashtextextended(?, 0))',
    );
    expect(key).toBe(`payroll-period:${PERIOD}`);
    expect(client.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      client.payrollPeriod.findUnique.mock.invocationCallOrder[0],
    );
  });

  it('tarif awal bulan; struktur gaji dan karyawan sampai akhir bulan', async () => {
    const { service, client, configs } = setup();

    await service.run(PERIOD);

    expect(configs.ratesOn).toHaveBeenCalledWith('2026-11-01', client);
    const args = client.employee.findMany.mock.calls[0][0];
    const end = new Date('2026-11-30T00:00:00.000Z');
    expect(args.where).toEqual({
      user: { isActive: true },
      joinDate: { lte: end },
    });
    expect(args.select).toMatchObject({
      salaries: { where: { effectiveFrom: { lte: end } }, take: 1 },
    });
  });

  it('upsert per (periodId, employeeId) dengan snapshot dan configSnapshot; karyawan tanpa gaji dilewati', async () => {
    const { service, upserted } = setup();

    const result = await service.run(PERIOD);

    expect(upserted.map((args) => args.where)).toEqual([
      { periodId_employeeId: { periodId: PERIOD, employeeId: ALICE } },
      { periodId_employeeId: { periodId: PERIOD, employeeId: BUDI } },
    ]);
    const alice = upserted[0] as { create: Record<string, unknown> };
    expect(alice.create).toMatchObject({
      employeeName: 'Karyawan BRT-2024-0001',
      departmentName: 'Teknologi Informasi',
      positionName: 'Backend Developer',
      bankAccountLast4: '1234',
      employerContributions: { JKK: '21600.00', total: '921600.00' },
      configSnapshot: {
        JP: { wageCap: '10547400.00', effectiveFrom: '2025-03-01' },
      },
    });
    expect((alice.create.net as Prisma.Decimal).toFixed(2)).toBe('8640000.00');
    expect(result.skipped).toEqual([
      {
        employeeId: CITRA,
        nip: 'BRT-2024-0003',
        fullName: 'Karyawan BRT-2024-0003',
      },
    ]);
    expect([result.created, result.updated]).toEqual([2, 0]);
  });

  it('isian HR yang sudah ada dipertahankan: update tidak menulis bonus/pph21/potongan/catatan', async () => {
    const { service, upserted } = setup('DRAFT', [existingItem(ALICE)]);

    const result = await service.run(PERIOD);

    const alice = upserted[0] as {
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    };
    for (const field of ['bonus', 'pph21', 'otherDeductions', 'note']) {
      expect(alice.update).not.toHaveProperty(field);
    }
    // Gaji dari struktur sekarang (bukan dari slip lama); bruto/net memakai isian HR.
    expect((alice.update.baseSalary as Prisma.Decimal).toFixed(0)).toBe(
      '8000000',
    );
    expect((alice.update.gross as Prisma.Decimal).toFixed(0)).toBe('10500000');
    // 10.500.000 - 360.000 - 250.000 - 50.000
    expect((alice.update.net as Prisma.Decimal).toFixed(0)).toBe('9840000');
    expect([result.created, result.updated]).toEqual([1, 1]);
  });

  it('slip karyawan yang tidak lagi memenuhi syarat dihapus dari draft', async () => {
    const { service, client } = setup();
    client.payrollItem.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.run(PERIOD);

    expect(client.payrollItem.deleteMany).toHaveBeenCalledWith({
      where: { periodId: PERIOD, employeeId: { notIn: [ALICE, BUDI] } },
    });
    expect(result.removed).toBe(1);
  });

  it('audit before/after berisi total periode', async () => {
    const { service, audit, client } = setup();
    client.payrollItem.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([existingItem(ALICE)]);

    await service.run(PERIOD);

    const [change, tx] = audit.recordChange.mock.calls[0];
    expect(tx).toBe(client);
    expect(change).toMatchObject({
      entity: 'PayrollPeriod',
      entityId: PERIOD,
      before: { totals: { itemCount: 0, net: '0.00' } },
      after: {
        created: 2,
        skipped: 1,
        totals: { itemCount: 1, net: '1200001.00' },
      },
    });
  });

  it.each(['FINAL', 'PAID'] as const)(
    'periode %s: 409 tanpa menulis slip',
    async (status) => {
      const { service, upserted } = setup(status);

      await expect(service.run(PERIOD)).rejects.toThrow(ConflictException);
      expect(upserted).toHaveLength(0);
    },
  );

  it('periode tidak ada: 404', async () => {
    const { service, client } = setup();
    client.payrollPeriod.findUnique.mockResolvedValue(null);

    await expect(service.run(PERIOD)).rejects.toThrow(NotFoundException);
  });

  it('tidak ada karyawan dengan gaji: 422', async () => {
    const { service, client } = setup();
    client.employee.findMany.mockResolvedValue([
      employee(CITRA, 'BRT-2024-0003', null),
    ]);

    await expect(service.run(PERIOD)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });
});
