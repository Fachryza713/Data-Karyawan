import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  type QueryArgs,
  queryMock,
  storageMock,
} from '../../../test/fixtures/employees.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { PayrollMessages } from './payroll.constants.js';
import { PayslipsService } from './payslips.service.js';

const d = (value: string) => new Prisma.Decimal(value);
const USER = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e11';
const EMPLOYEE = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e10';
const PERIOD = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e80';
const NOW = new Date('2026-11-26T03:00:00.000Z');

const period = {
  id: PERIOD,
  period: '2026-11',
  status: 'FINAL',
  finalizedAt: NOW,
  paidAt: null,
};

const item = {
  id: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e81',
  periodId: PERIOD,
  employeeId: EMPLOYEE,
  employeeName: 'Raditya Pratama',
  nip: 'BRT-2024-0001',
  departmentName: 'Teknologi Informasi',
  positionName: 'Frontend Developer',
  bankName: 'BCA',
  bankAccountLast4: '8821',
  baseSalary: d('8000000'),
  fixedAllowance: d('1000000'),
  bonus: d('500000'),
  gross: d('9500000'),
  bpjsKes: d('90000'),
  bpjsJht: d('180000'),
  bpjsJp: d('90000'),
  pph21: d('100000'),
  otherDeductions: d('0'),
  net: d('9040000'),
  employerContributions: {},
  configSnapshot: {},
  note: null,
  updatedAt: NOW,
  period,
};

function setup() {
  const client = {
    employee: { findUnique: queryMock().mockResolvedValue({ id: EMPLOYEE }) },
    payrollItem: {
      findMany: queryMock().mockResolvedValue([
        { gross: item.gross, net: item.net, period },
      ]),
      findFirst: queryMock().mockResolvedValue(item),
    },
  };
  const storage = storageMock();
  const service = new PayslipsService(
    { client } as unknown as PrismaService,
    storage as unknown as StorageService,
    { now: () => NOW },
  );
  return { service, client, storage };
}

const firstArgs = (mock: { mock: { calls: QueryArgs[][] } }) =>
  mock.mock.calls[0][0];

describe('PayslipsService', () => {
  it('daftar: karyawan dari JWT, hanya periode FINAL/PAID', async () => {
    const { service, client } = setup();

    await expect(service.listMine(USER)).resolves.toEqual([
      {
        periodId: PERIOD,
        period: '2026-11',
        status: 'FINAL',
        gross: '9500000.00',
        net: '9040000.00',
        paidAt: null,
      },
    ]);
    expect(firstArgs(client.employee.findUnique).where).toEqual({
      userId: USER,
    });
    expect(firstArgs(client.payrollItem.findMany).where).toEqual({
      employeeId: EMPLOYEE,
      period: { status: { in: ['FINAL', 'PAID'] } },
    });
  });

  it('detail: filter employeeId milik sendiri + periode terbit; angka dari snapshot', async () => {
    const { service, client } = setup();

    const slip = await service.findMine(USER, PERIOD);

    expect(firstArgs(client.payrollItem.findFirst).where).toEqual({
      employeeId: EMPLOYEE,
      periodId: PERIOD,
      period: { status: { in: ['FINAL', 'PAID'] } },
    });
    expect(slip).toMatchObject({
      period: '2026-11',
      employee: { fullName: 'Raditya Pratama', nip: 'BRT-2024-0001' },
      bank: { bankName: 'BCA', accountLast4: '8821' },
      earnings: {
        baseSalary: '8000000.00',
        bonus: '500000.00',
        gross: '9500000.00',
      },
      // 90.000 + 180.000 + 90.000 + 100.000
      deductions: { total: '460000.00', pph21: '100000.00' },
      net: '9040000.00',
    });
    expect(slip).not.toHaveProperty('employerContributions');
  });

  it('slip DRAFT atau milik orang lain tidak ditemukan oleh filter: 404', async () => {
    const { service, client } = setup();
    client.payrollItem.findFirst.mockResolvedValue(null);

    await expect(service.findMine(USER, PERIOD)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('akun tanpa data karyawan: 404', async () => {
    const { service, client } = setup();
    client.employee.findUnique.mockResolvedValue(null);

    await expect(service.listMine(USER)).rejects.toThrow(NotFoundException);
  });
});

describe('PayslipsService.myPdf', () => {
  const KEY = `payslips/2026-11/${EMPLOYEE}.pdf`;
  const pdfRow = (slipStatus: string, slipKey: string | null = null) => ({
    nip: 'BRT-2024-0001',
    slipStatus,
    slipKey,
    period: { period: '2026-11' },
  });

  it('READY: presigned URL 5 menit dengan nama file slip', async () => {
    const { service, client, storage } = setup();
    client.payrollItem.findFirst.mockResolvedValue(pdfRow('READY', KEY));

    await expect(service.myPdf(USER, PERIOD)).resolves.toEqual({
      status: 'READY',
      url: `https://storage.test/${KEY}?signed=1`,
      expiresAt: '2026-11-26T03:05:00.000Z',
    });
    expect(storage.createPresignedDownload).toHaveBeenCalledWith(
      KEY,
      300,
      'slip-gaji-2026-11-BRT-2024-0001.pdf',
    );
    // Karyawan dari JWT, hanya periode terbit.
    expect(firstArgs(client.payrollItem.findFirst).where).toEqual({
      employeeId: EMPLOYEE,
      periodId: PERIOD,
      period: { status: { in: ['FINAL', 'PAID'] } },
    });
  });

  it('QUEUED: masih dibuat (controller membalas 202), tanpa URL', async () => {
    const { service, client, storage } = setup();
    client.payrollItem.findFirst.mockResolvedValue(pdfRow('QUEUED'));

    await expect(service.myPdf(USER, PERIOD)).resolves.toEqual({
      status: 'QUEUED',
      message: PayrollMessages.slipPdfQueued,
    });
    expect(storage.createPresignedDownload).not.toHaveBeenCalled();
  });

  it('FAILED atau NONE: 409 dengan arahan ke HR', async () => {
    const { service, client } = setup();
    client.payrollItem.findFirst.mockResolvedValue(pdfRow('FAILED'));
    await expect(service.myPdf(USER, PERIOD)).rejects.toThrow(
      new ConflictException(PayrollMessages.slipPdfFailed),
    );
    client.payrollItem.findFirst.mockResolvedValue(pdfRow('NONE'));
    await expect(service.myPdf(USER, PERIOD)).rejects.toThrow(
      new ConflictException(PayrollMessages.slipPdfNotRequested),
    );
  });

  it('slip DRAFT atau milik orang lain: 404', async () => {
    const { service, client } = setup();
    client.payrollItem.findFirst.mockResolvedValue(null);

    await expect(service.myPdf(USER, PERIOD)).rejects.toThrow(
      NotFoundException,
    );
  });
});
