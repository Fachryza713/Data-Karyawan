import { formatMoney, formatRate } from '../../common/money/money.js';
import { toDateOnly } from '../../common/validation/date-only.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  BenefitResponseDto,
  PayrollConfigResponseDto,
  PayrollItemResponseDto,
  PayrollPeriodResponseDto,
  PayslipResponseDto,
  SalaryStructureResponseDto,
} from './dto/payroll-response.dto.js';
import {
  parseEmployerContributions,
  toEmployerContributionsJson,
} from './payroll-totals.js';

export const SALARY_STRUCTURE_SELECT = {
  id: true,
  employeeId: true,
  baseSalary: true,
  fixedAllowance: true,
  bankName: true,
  bankAccountLast4: true,
  effectiveFrom: true,
  createdAt: true,
} as const satisfies Prisma.SalaryStructureSelect;

export type SalaryStructureRow = Prisma.SalaryStructureGetPayload<{
  select: typeof SALARY_STRUCTURE_SELECT;
}>;

export const BENEFIT_SELECT = {
  id: true,
  employeeId: true,
  provider: true,
  program: true,
  cardNo: true,
  class: true,
  dependents: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.BenefitSelect;

export type BenefitRow = Prisma.BenefitGetPayload<{
  select: typeof BENEFIT_SELECT;
}>;

export const PAYROLL_CONFIG_SELECT = {
  id: true,
  key: true,
  employeeRate: true,
  employerRate: true,
  wageCap: true,
  effectiveFrom: true,
  createdAt: true,
} as const satisfies Prisma.PayrollConfigSelect;

export type PayrollConfigRow = Prisma.PayrollConfigGetPayload<{
  select: typeof PAYROLL_CONFIG_SELECT;
}>;

export const PAYROLL_PERIOD_SELECT = {
  id: true,
  period: true,
  status: true,
  finalizedAt: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
  finalizedBy: {
    select: { id: true, email: true, employee: { select: { fullName: true } } },
  },
} as const satisfies Prisma.PayrollPeriodSelect;

export type PayrollPeriodRow = Prisma.PayrollPeriodGetPayload<{
  select: typeof PAYROLL_PERIOD_SELECT;
}>;

export const PAYROLL_ITEM_SELECT = {
  id: true,
  periodId: true,
  employeeId: true,
  employeeName: true,
  nip: true,
  departmentName: true,
  positionName: true,
  bankName: true,
  bankAccountLast4: true,
  baseSalary: true,
  fixedAllowance: true,
  bonus: true,
  gross: true,
  bpjsKes: true,
  bpjsJht: true,
  bpjsJp: true,
  pph21: true,
  otherDeductions: true,
  net: true,
  employerContributions: true,
  configSnapshot: true,
  note: true,
  updatedAt: true,
} as const satisfies Prisma.PayrollItemSelect;

export type PayrollItemRow = Prisma.PayrollItemGetPayload<{
  select: typeof PAYROLL_ITEM_SELECT;
}>;

export function toSalaryStructureDto(
  row: SalaryStructureRow,
  currentId: string | null,
): SalaryStructureResponseDto {
  return {
    id: row.id,
    employeeId: row.employeeId,
    baseSalary: formatMoney(row.baseSalary),
    fixedAllowance: formatMoney(row.fixedAllowance),
    bankName: row.bankName,
    bankAccountLast4: row.bankAccountLast4,
    effectiveFrom: toDateOnly(row.effectiveFrom),
    createdAt: row.createdAt.toISOString(),
    isCurrent: row.id === currentId,
  };
}

/** Isi struktur gaji untuk AuditLog (uang sebagai teks). */
export function salaryStructureSnapshot(row: SalaryStructureRow) {
  return {
    id: row.id,
    baseSalary: formatMoney(row.baseSalary),
    fixedAllowance: formatMoney(row.fixedAllowance),
    bankName: row.bankName,
    bankAccountLast4: row.bankAccountLast4,
    effectiveFrom: toDateOnly(row.effectiveFrom),
  };
}

export function toBenefitDto(row: BenefitRow): BenefitResponseDto {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function benefitSnapshot(row: BenefitRow) {
  const {
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...snapshot
  } = toBenefitDto(row);
  return snapshot;
}

export function toPayrollConfigDto(
  row: PayrollConfigRow,
): PayrollConfigResponseDto {
  return {
    id: row.id,
    key: row.key,
    employeeRate: formatRate(row.employeeRate),
    employerRate: formatRate(row.employerRate),
    wageCap: row.wageCap ? formatMoney(row.wageCap) : null,
    effectiveFrom: toDateOnly(row.effectiveFrom),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toPayrollPeriodDto(
  row: PayrollPeriodRow,
  summary: { itemCount: number; totalNet: Prisma.Decimal },
): PayrollPeriodResponseDto {
  return {
    id: row.id,
    period: row.period,
    status: row.status,
    finalizedBy: row.finalizedBy
      ? {
          id: row.finalizedBy.id,
          name: row.finalizedBy.employee?.fullName ?? row.finalizedBy.email,
        }
      : null,
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    itemCount: summary.itemCount,
    totalNet: formatMoney(summary.totalNet),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPayrollItemDto(row: PayrollItemRow): PayrollItemResponseDto {
  return {
    id: row.id,
    periodId: row.periodId,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    nip: row.nip,
    departmentName: row.departmentName,
    positionName: row.positionName,
    bankName: row.bankName,
    bankAccountLast4: row.bankAccountLast4,
    baseSalary: formatMoney(row.baseSalary),
    fixedAllowance: formatMoney(row.fixedAllowance),
    bonus: formatMoney(row.bonus),
    gross: formatMoney(row.gross),
    bpjsKes: formatMoney(row.bpjsKes),
    bpjsJht: formatMoney(row.bpjsJht),
    bpjsJp: formatMoney(row.bpjsJp),
    pph21: formatMoney(row.pph21),
    otherDeductions: formatMoney(row.otherDeductions),
    net: formatMoney(row.net),
    employerContributions: toEmployerContributionsJson(
      parseEmployerContributions(row.employerContributions),
    ),
    configSnapshot: row.configSnapshot as Record<string, unknown>,
    note: row.note,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Isian HR + hasilnya untuk AuditLog perubahan slip. */
export function payrollItemSnapshot(row: {
  bonus: Prisma.Decimal;
  pph21: Prisma.Decimal;
  otherDeductions: Prisma.Decimal;
  note: string | null;
  gross: Prisma.Decimal;
  net: Prisma.Decimal;
}) {
  return {
    bonus: formatMoney(row.bonus),
    pph21: formatMoney(row.pph21),
    otherDeductions: formatMoney(row.otherDeductions),
    note: row.note,
    gross: formatMoney(row.gross),
    net: formatMoney(row.net),
  };
}

/** Slip karyawan dari snapshot item; tidak membaca data gaji yang sekarang. */
export function toPayslipDto(
  item: PayrollItemRow,
  period: Pick<
    PayrollPeriodRow,
    'id' | 'period' | 'status' | 'finalizedAt' | 'paidAt'
  >,
): PayslipResponseDto {
  const deductions = item.bpjsKes
    .plus(item.bpjsJht)
    .plus(item.bpjsJp)
    .plus(item.pph21)
    .plus(item.otherDeductions);
  return {
    periodId: period.id,
    period: period.period,
    status: period.status,
    finalizedAt: period.finalizedAt?.toISOString() ?? null,
    paidAt: period.paidAt?.toISOString() ?? null,
    employee: {
      fullName: item.employeeName,
      nip: item.nip,
      departmentName: item.departmentName,
      positionName: item.positionName,
    },
    bank: { bankName: item.bankName, accountLast4: item.bankAccountLast4 },
    earnings: {
      baseSalary: formatMoney(item.baseSalary),
      fixedAllowance: formatMoney(item.fixedAllowance),
      bonus: formatMoney(item.bonus),
      gross: formatMoney(item.gross),
    },
    deductions: {
      bpjsKes: formatMoney(item.bpjsKes),
      bpjsJht: formatMoney(item.bpjsJht),
      bpjsJp: formatMoney(item.bpjsJp),
      pph21: formatMoney(item.pph21),
      otherDeductions: formatMoney(item.otherDeductions),
      total: formatMoney(deductions),
    },
    net: formatMoney(item.net),
    note: item.note,
  };
}
