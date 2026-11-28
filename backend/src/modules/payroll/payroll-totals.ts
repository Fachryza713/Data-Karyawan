import {
  formatMoney,
  formatRate,
  zeroMoney,
} from '../../common/money/money.js';
import { toDateOnly } from '../../common/validation/date-only.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PayrollConfigKey } from '../../generated/prisma/enums.js';
import {
  type EmployerContributions,
  PAYROLL_PROGRAMS,
} from './payroll-calculator.js';
import type { ConfigRow } from './payroll-rules.js';

/**
 * Konversi snapshot JSON slip dan penjumlahan total periode. Rupiah di JSON
 * disimpan sebagai teks ("480000.00") dan dibaca kembali sebagai Decimal,
 * jadi tidak pernah lewat number.
 */

type Decimal = Prisma.Decimal;

export type EmployerContributionsJson = Record<
  PayrollConfigKey | 'total',
  string
>;

export type ConfigSnapshotJson = Record<
  PayrollConfigKey,
  {
    employeeRate: string;
    employerRate: string;
    wageCap: string | null;
    effectiveFrom: string;
  }
>;

export function toEmployerContributionsJson(
  contributions: EmployerContributions,
): EmployerContributionsJson {
  const json = {} as EmployerContributionsJson;
  for (const key of PAYROLL_PROGRAMS) {
    json[key] = formatMoney(contributions[key]);
  }
  json.total = formatMoney(contributions.total);
  return json;
}

/** Baca kembali employerContributions dari kolom JSON. */
export function parseEmployerContributions(
  json: Prisma.JsonValue,
): EmployerContributions {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('employerContributions bukan objek');
  }
  const read = (key: string): Decimal => {
    const value = (json as Record<string, unknown>)[key];
    if (typeof value !== 'string') {
      throw new Error(`employerContributions.${key} tidak valid`);
    }
    return new Prisma.Decimal(value);
  };
  const result = {} as EmployerContributions;
  for (const key of PAYROLL_PROGRAMS) {
    result[key] = read(key);
  }
  result.total = read('total');
  return result;
}

export function toConfigSnapshotJson(
  rows: Record<PayrollConfigKey, ConfigRow>,
): ConfigSnapshotJson {
  const json = {} as ConfigSnapshotJson;
  for (const key of PAYROLL_PROGRAMS) {
    const row = rows[key];
    json[key] = {
      employeeRate: formatRate(row.employeeRate),
      employerRate: formatRate(row.employerRate),
      wageCap: row.wageCap ? formatMoney(row.wageCap) : null,
      effectiveFrom: toDateOnly(row.effectiveFrom),
    };
  }
  return json;
}

export type ItemAmounts = {
  baseSalary: Decimal;
  fixedAllowance: Decimal;
  bonus: Decimal;
  gross: Decimal;
  bpjsKes: Decimal;
  bpjsJht: Decimal;
  bpjsJp: Decimal;
  pph21: Decimal;
  otherDeductions: Decimal;
  net: Decimal;
  employerContributions: Prisma.JsonValue;
};

const AMOUNT_FIELDS = [
  'baseSalary',
  'fixedAllowance',
  'bonus',
  'gross',
  'bpjsKes',
  'bpjsJht',
  'bpjsJp',
  'pph21',
  'otherDeductions',
  'net',
] as const;

type AmountField = (typeof AMOUNT_FIELDS)[number];

export type PayrollTotals = Record<AmountField, Decimal> & {
  itemCount: number;
  employer: EmployerContributions;
};

/** Total satu periode dari slip-slipnya (Decimal, tanpa pembulatan ulang). */
export function sumItems(items: readonly ItemAmounts[]): PayrollTotals {
  const totals = { itemCount: items.length } as PayrollTotals;
  for (const field of AMOUNT_FIELDS) {
    totals[field] = zeroMoney();
  }
  const employer = { total: zeroMoney() } as EmployerContributions;
  for (const key of PAYROLL_PROGRAMS) {
    employer[key] = zeroMoney();
  }
  for (const item of items) {
    for (const field of AMOUNT_FIELDS) {
      totals[field] = totals[field].plus(item[field]);
    }
    const contributions = parseEmployerContributions(
      item.employerContributions,
    );
    for (const key of PAYROLL_PROGRAMS) {
      employer[key] = employer[key].plus(contributions[key]);
    }
    employer.total = employer.total.plus(contributions.total);
  }
  totals.employer = employer;
  return totals;
}

export type PayrollTotalsJson = Record<AmountField, string> & {
  itemCount: number;
  employer: EmployerContributionsJson;
};

export function toTotalsJson(totals: PayrollTotals): PayrollTotalsJson {
  const json = { itemCount: totals.itemCount } as PayrollTotalsJson;
  for (const field of AMOUNT_FIELDS) {
    json[field] = formatMoney(totals[field]);
  }
  json.employer = toEmployerContributionsJson(totals.employer);
  return json;
}
