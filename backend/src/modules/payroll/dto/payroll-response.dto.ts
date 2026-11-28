import { ApiProperty } from '@nestjs/swagger';
import {
  BenefitStatus,
  PayrollConfigKey,
  PayrollPeriodStatus,
} from '../../../generated/prisma/enums.js';

/** Semua uang di response berupa teks 2 desimal, contoh "8500000.00". */
const money = (example = '8500000.00') =>
  ApiProperty({ type: String, example, description: 'Rupiah (teks)' });

export class SalaryStructureResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  employeeId: string;

  @money()
  baseSalary: string;

  @money('1000000.00')
  fixedAllowance: string;

  @ApiProperty({ example: 'BCA' })
  bankName: string;

  @ApiProperty({ example: '8821' })
  bankAccountLast4: string;

  @ApiProperty({ format: 'date' })
  effectiveFrom: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ description: 'Struktur yang berlaku hari ini (WIB).' })
  isCurrent: boolean;
}

export class BenefitResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  employeeId: string;

  @ApiProperty({ example: 'BPJS Kesehatan' })
  provider: string;

  @ApiProperty({ type: String, nullable: true, example: 'JKN' })
  program: string | null;

  @ApiProperty({ type: String, nullable: true, example: '0001234567890' })
  cardNo: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Kelas 1' })
  class: string | null;

  @ApiProperty({ example: 2 })
  dependents: number;

  @ApiProperty({ enum: BenefitStatus })
  status: BenefitStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class PayrollConfigResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: PayrollConfigKey })
  key: PayrollConfigKey;

  @ApiProperty({ example: '0.0100', description: 'Pecahan: 0.0100 = 1%' })
  employeeRate: string;

  @ApiProperty({ example: '0.0400' })
  employerRate: string;

  @ApiProperty({ type: String, nullable: true, example: '12000000.00' })
  wageCap: string | null;

  @ApiProperty({ format: 'date' })
  effectiveFrom: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class PayrollConfigListResponseDto {
  @ApiProperty({ format: 'date', description: 'Tanggal acuan tarif current.' })
  date: string;

  @ApiProperty({
    type: [PayrollConfigResponseDto],
    description: 'Tarif yang berlaku pada `date`, satu per program.',
  })
  current: PayrollConfigResponseDto[];

  @ApiProperty({
    type: [PayrollConfigResponseDto],
    description: 'Semua baris tarif (termasuk yang lama dan yang akan datang).',
  })
  history: PayrollConfigResponseDto[];
}

export class EmployerContributionsDto {
  @money('480000.00')
  BPJS_KES: string;

  @money('555000.00')
  JHT: string;

  @money('210948.00')
  JP: string;

  @money('36000.00')
  JKK: string;

  @money('45000.00')
  JKM: string;

  @money('1326948.00')
  total: string;
}

export class PayrollTotalsDto {
  @ApiProperty({ example: 29 })
  itemCount: number;

  @money()
  baseSalary: string;

  @money()
  fixedAllowance: string;

  @money('0.00')
  bonus: string;

  @money()
  gross: string;

  @money()
  bpjsKes: string;

  @money()
  bpjsJht: string;

  @money()
  bpjsJp: string;

  @money('0.00')
  pph21: string;

  @money('0.00')
  otherDeductions: string;

  @money()
  net: string;

  @ApiProperty({ type: EmployerContributionsDto })
  employer: EmployerContributionsDto;
}

export class PayrollItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  periodId: string;

  @ApiProperty({ format: 'uuid' })
  employeeId: string;

  @ApiProperty({ example: 'Raditya Pratama' })
  employeeName: string;

  @ApiProperty({ example: 'BRT-2024-0001' })
  nip: string;

  @ApiProperty({ example: 'Teknologi Informasi' })
  departmentName: string;

  @ApiProperty({ example: 'Frontend Developer' })
  positionName: string;

  @ApiProperty({ example: 'BCA' })
  bankName: string;

  @ApiProperty({ example: '8821' })
  bankAccountLast4: string;

  @money()
  baseSalary: string;

  @money('1000000.00')
  fixedAllowance: string;

  @money('0.00')
  bonus: string;

  @money()
  gross: string;

  @money('95000.00')
  bpjsKes: string;

  @money('190000.00')
  bpjsJht: string;

  @money('95000.00')
  bpjsJp: string;

  @money('0.00')
  pph21: string;

  @money('0.00')
  otherDeductions: string;

  @money()
  net: string;

  @ApiProperty({ type: EmployerContributionsDto })
  employerContributions: EmployerContributionsDto;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Tarif yang dipakai per program: { employeeRate, employerRate, wageCap, effectiveFrom }.',
  })
  configSnapshot: Record<string, unknown>;

  @ApiProperty({ type: String, nullable: true })
  note: string | null;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class UserRefDto {
  @ApiProperty({ format: 'uuid', description: 'ID akun (user).' })
  id: string;

  @ApiProperty({ example: 'Dian Lestari' })
  name: string;
}

export class PayrollPeriodResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '2026-11' })
  period: string;

  @ApiProperty({ enum: PayrollPeriodStatus })
  status: PayrollPeriodStatus;

  @ApiProperty({ type: UserRefDto, nullable: true })
  finalizedBy: UserRefDto | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finalizedAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidAt: string | null;

  @ApiProperty({ example: 29 })
  itemCount: number;

  @money('254000000.00')
  totalNet: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class PayrollPeriodDetailResponseDto extends PayrollPeriodResponseDto {
  @ApiProperty({ type: [PayrollItemResponseDto] })
  items: PayrollItemResponseDto[];

  @ApiProperty({ type: PayrollTotalsDto })
  totals: PayrollTotalsDto;
}

export class SkippedEmployeeDto {
  @ApiProperty({ format: 'uuid' })
  employeeId: string;

  @ApiProperty({ example: 'BRT-2026-0042' })
  nip: string;

  @ApiProperty({ example: 'Karyawan Baru' })
  fullName: string;
}

export class PayrollRunResponseDto {
  @ApiProperty({ type: PayrollPeriodResponseDto })
  period: PayrollPeriodResponseDto;

  @ApiProperty({ example: 29, description: 'Slip baru.' })
  created: number;

  @ApiProperty({
    example: 0,
    description: 'Slip yang sudah ada dan dihitung ulang.',
  })
  updated: number;

  @ApiProperty({
    example: 0,
    description:
      'Slip karyawan yang tidak lagi memenuhi syarat (dihapus dari draft).',
  })
  removed: number;

  @ApiProperty({
    type: [SkippedEmployeeDto],
    description: 'Karyawan aktif tanpa struktur gaji yang berlaku.',
  })
  skipped: SkippedEmployeeDto[];

  @ApiProperty({ type: PayrollTotalsDto })
  totals: PayrollTotalsDto;
}

export class EmployerContributionRowDto {
  @ApiProperty({ format: 'uuid' })
  employeeId: string;

  @ApiProperty({ example: 'BRT-2024-0001' })
  nip: string;

  @ApiProperty({ example: 'Raditya Pratama' })
  employeeName: string;

  @ApiProperty({ example: 'Teknologi Informasi' })
  departmentName: string;

  @ApiProperty({ type: EmployerContributionsDto })
  contributions: EmployerContributionsDto;
}

export class EmployerContributionReportDto {
  @ApiProperty({ format: 'uuid' })
  periodId: string;

  @ApiProperty({ example: '2026-11' })
  period: string;

  @ApiProperty({ enum: PayrollPeriodStatus })
  status: PayrollPeriodStatus;

  @ApiProperty({
    type: EmployerContributionsDto,
    description: 'Jumlah per program untuk semua karyawan.',
  })
  totals: EmployerContributionsDto;

  @ApiProperty({ type: [EmployerContributionRowDto] })
  items: EmployerContributionRowDto[];
}

// ---------------------------------------------------------------------------
// Slip karyawan
// ---------------------------------------------------------------------------

export class PayslipSummaryDto {
  @ApiProperty({ format: 'uuid' })
  periodId: string;

  @ApiProperty({ example: '2026-11' })
  period: string;

  @ApiProperty({ enum: [PayrollPeriodStatus.FINAL, PayrollPeriodStatus.PAID] })
  status: PayrollPeriodStatus;

  @money()
  gross: string;

  @money()
  net: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidAt: string | null;
}

export class PayslipEmployeeDto {
  @ApiProperty({ example: 'Raditya Pratama' })
  fullName: string;

  @ApiProperty({ example: 'BRT-2024-0001' })
  nip: string;

  @ApiProperty({ example: 'Teknologi Informasi' })
  departmentName: string;

  @ApiProperty({ example: 'Frontend Developer' })
  positionName: string;
}

export class PayslipBankDto {
  @ApiProperty({ example: 'BCA' })
  bankName: string;

  @ApiProperty({ example: '8821' })
  accountLast4: string;
}

export class PayslipEarningsDto {
  @money()
  baseSalary: string;

  @money('1000000.00')
  fixedAllowance: string;

  @money('0.00')
  bonus: string;

  @money()
  gross: string;
}

export class PayslipDeductionsDto {
  @money('95000.00')
  bpjsKes: string;

  @money('190000.00')
  bpjsJht: string;

  @money('95000.00')
  bpjsJp: string;

  @money('0.00')
  pph21: string;

  @money('0.00')
  otherDeductions: string;

  @money('380000.00')
  total: string;
}

/** Slip gaji karyawan, dibaca dari snapshot PayrollItem (tidak dihitung ulang). */
export class PayslipResponseDto {
  @ApiProperty({ format: 'uuid' })
  periodId: string;

  @ApiProperty({ example: '2026-11' })
  period: string;

  @ApiProperty({ enum: [PayrollPeriodStatus.FINAL, PayrollPeriodStatus.PAID] })
  status: PayrollPeriodStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finalizedAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidAt: string | null;

  @ApiProperty({ type: PayslipEmployeeDto })
  employee: PayslipEmployeeDto;

  @ApiProperty({ type: PayslipBankDto })
  bank: PayslipBankDto;

  @ApiProperty({ type: PayslipEarningsDto })
  earnings: PayslipEarningsDto;

  @ApiProperty({ type: PayslipDeductionsDto })
  deductions: PayslipDeductionsDto;

  @money()
  net: string;

  @ApiProperty({ type: String, nullable: true })
  note: string | null;
}
