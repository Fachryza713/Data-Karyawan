import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { type QueryArgs, queryMock } from '../../../test/fixtures/employees.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import { CompensationService } from './compensation.service.js';

const d = (value: string) => new Prisma.Decimal(value);
const EMPLOYEE = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e10';
const USER = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e11';
const BENEFIT = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e90';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
// Kamis 26 Nov 2026 WIB.
const NOW = new Date('2026-11-26T03:00:00.000Z');

const structure = (id: string, base: string, effectiveFrom: string) => ({
  id,
  employeeId: EMPLOYEE,
  baseSalary: d(base),
  fixedAllowance: d('1000000'),
  bankName: 'BCA',
  bankAccountLast4: '8821',
  effectiveFrom: day(effectiveFrom),
  createdAt: new Date(`${effectiveFrom}T01:00:00.000Z`),
});

const benefit = {
  id: BENEFIT,
  employeeId: EMPLOYEE,
  provider: 'BPJS Kesehatan',
  program: 'JKN',
  cardNo: '0001234567890',
  class: 'Kelas 2',
  dependents: 1,
  status: 'ACTIVE',
  createdAt: NOW,
  updatedAt: NOW,
};

function setup() {
  const client = {
    employee: { findUnique: queryMock().mockResolvedValue({ id: EMPLOYEE }) },
    salaryStructure: {
      findFirst: queryMock().mockResolvedValue(
        structure('old', '8000000', '2024-01-01'),
      ),
      create: queryMock().mockImplementation((args) =>
        Promise.resolve({
          ...structure('new', '0', '2026-12-01'),
          ...(args.data as object),
          id: 'new',
        }),
      ),
      findMany: queryMock().mockResolvedValue([
        structure('next', '9500000', '2027-01-01'),
        structure('old', '8000000', '2024-01-01'),
      ]),
    },
    benefit: {
      findMany: queryMock().mockResolvedValue([benefit]),
      findFirst: queryMock().mockResolvedValue(benefit),
      create: queryMock().mockImplementation((args) =>
        Promise.resolve({ ...benefit, ...(args.data as object) }),
      ),
      update: queryMock().mockImplementation((args) =>
        Promise.resolve({ ...benefit, ...(args.data as object) }),
      ),
      delete: queryMock().mockResolvedValue(benefit),
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
  const service = new CompensationService(
    { client } as unknown as PrismaService,
    audit as unknown as AuditService,
    { now: () => NOW },
  );
  return { service, client, audit };
}

const firstArgs = (mock: { mock: { calls: QueryArgs[][] } }) =>
  mock.mock.calls[0][0];

describe('CompensationService struktur gaji', () => {
  it('kenaikan gaji = baris baru (create, bukan update); audit before = struktur terbaru sebelumnya', async () => {
    const { service, client, audit } = setup();

    await service.createSalaryStructure(EMPLOYEE, {
      baseSalary: '9500000',
      bankName: 'BCA',
      bankAccountLast4: '8821',
      effectiveFrom: '2026-12-01',
    });

    const data = firstArgs(client.salaryStructure.create).data!;
    expect((data.baseSalary as Prisma.Decimal).toFixed(2)).toBe('9500000.00');
    // fixedAllowance default 0, tetap Decimal.
    expect(Prisma.Decimal.isDecimal(data.fixedAllowance)).toBe(true);
    expect((data.fixedAllowance as Prisma.Decimal).toFixed(2)).toBe('0.00');
    expect(client.salaryStructure).not.toHaveProperty('update');
    expect(audit.recordChange.mock.calls[0][0]).toMatchObject({
      entity: 'SalaryStructure',
      entityId: 'new',
      before: {
        id: 'old',
        baseSalary: '8000000.00',
        effectiveFrom: '2024-01-01',
      },
      after: {
        employeeId: EMPLOYEE,
        baseSalary: '9500000.00',
        effectiveFrom: '2026-12-01',
      },
    });
  });

  it('riwayat: isCurrent = struktur yang berlaku hari ini, bukan yang akan datang', async () => {
    const { service } = setup();

    const history = await service.listSalaryStructures(EMPLOYEE);

    expect(history.map((row) => [row.id, row.isCurrent])).toEqual([
      ['next', false],
      ['old', true],
    ]);
    expect(history[1]).toMatchObject({
      baseSalary: '8000000.00',
      fixedAllowance: '1000000.00',
    });
  });

  it('karyawan tidak ada atau nonaktif: 404 tanpa menulis', async () => {
    const { service, client } = setup();
    client.employee.findUnique.mockResolvedValue(null);

    await expect(
      service.createSalaryStructure(EMPLOYEE, {
        baseSalary: '1',
        bankName: 'BCA',
        bankAccountLast4: '0000',
        effectiveFrom: '2026-12-01',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(client.salaryStructure.create).not.toHaveBeenCalled();
  });
});

describe('CompensationService manfaat', () => {
  it('ubah hanya field yang berubah; audit berisi diff', async () => {
    const { service, client, audit } = setup();

    await service.updateBenefit(EMPLOYEE, BENEFIT, {
      class: 'Kelas 1',
      dependents: 1,
    });

    expect(firstArgs(client.benefit.update).data).toEqual({ class: 'Kelas 1' });
    expect(audit.recordChange.mock.calls[0][0]).toMatchObject({
      before: { class: 'Kelas 2' },
      after: { class: 'Kelas 1' },
    });
  });

  it('null mengosongkan field opsional; tanpa perubahan tidak menulis', async () => {
    const { service, client, audit } = setup();

    await service.updateBenefit(EMPLOYEE, BENEFIT, { cardNo: null });
    expect(firstArgs(client.benefit.update).data).toEqual({ cardNo: null });

    client.benefit.update.mockClear();
    audit.recordChange.mockClear();
    await service.updateBenefit(EMPLOYEE, BENEFIT, {
      provider: 'BPJS Kesehatan',
    });
    expect(client.benefit.update).not.toHaveBeenCalled();
    expect(audit.recordChange).not.toHaveBeenCalled();
  });

  it('manfaat milik karyawan lain: 404 (dicari dengan employeeId dari path)', async () => {
    const { service, client } = setup();
    client.benefit.findFirst.mockResolvedValue(null);

    await expect(service.removeBenefit(EMPLOYEE, BENEFIT)).rejects.toThrow(
      NotFoundException,
    );
    expect(firstArgs(client.benefit.findFirst).where).toEqual({
      id: BENEFIT,
      employeeId: EMPLOYEE,
    });
    expect(client.benefit.delete).not.toHaveBeenCalled();
  });

  it('hapus: isi lama dicatat sebagai before', async () => {
    const { service, audit } = setup();

    await service.removeBenefit(EMPLOYEE, BENEFIT);

    expect(audit.recordChange.mock.calls[0][0]).toMatchObject({
      entity: 'Benefit',
      before: { provider: 'BPJS Kesehatan', cardNo: '0001234567890' },
    });
  });

  it('/benefits/me: karyawan dicari dari user ID JWT', async () => {
    const { service, client } = setup();

    await expect(service.listMyBenefits(USER)).resolves.toHaveLength(1);
    expect(firstArgs(client.employee.findUnique).where).toEqual({
      userId: USER,
    });
    expect(firstArgs(client.benefit.findMany).where).toEqual({
      employeeId: EMPLOYEE,
    });
  });
});
