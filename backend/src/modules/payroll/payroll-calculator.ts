import { Prisma } from '../../generated/prisma/client.js';
import { PayrollConfigKey } from '../../generated/prisma/enums.js';

/**
 * Perhitungan slip gaji tanpa I/O (PRD 6.4). Semua nilai Prisma.Decimal;
 * tidak ada konversi ke number di file ini (dijaga unit test).
 *
 *   dasar upah  = gaji pokok + tunjangan tetap, dibatasi wageCap per program
 *   iuran       = round(dasar upah program x tarif), rupiah, ROUND_HALF_UP
 *   bruto       = gaji pokok + tunjangan tetap + bonus
 *   take home   = bruto - BPJS Kes - JHT - JP (bagian karyawan) - PPh 21 - potongan lain
 *
 * Bagian perusahaan (BPJS Kes, JHT, JP, JKK, JKM) dihitung dengan cara yang
 * sama tetapi tidak memotong slip.
 */

type Decimal = Prisma.Decimal;

export type ProgramRate = {
  employeeRate: Decimal;
  employerRate: Decimal;
  /** Batas atas dasar upah. Null = tanpa batas. */
  wageCap: Decimal | null;
};

/** Tarif kelima program yang berlaku untuk satu periode. */
export type PayrollRates = Record<PayrollConfigKey, ProgramRate>;

export type SalaryInput = { baseSalary: Decimal; fixedAllowance: Decimal };

/** Nilai yang diisi HR per slip. */
export type ManualInput = {
  bonus: Decimal;
  pph21: Decimal;
  otherDeductions: Decimal;
};

export type EmployeeDeductions = {
  bpjsKes: Decimal;
  bpjsJht: Decimal;
  bpjsJp: Decimal;
};

export type EmployerContributions = Record<PayrollConfigKey, Decimal> & {
  total: Decimal;
};

export type PayslipAmounts = SalaryInput &
  ManualInput &
  EmployeeDeductions & {
    gross: Decimal;
    net: Decimal;
    employerContributions: EmployerContributions;
  };

/** Urutan program di laporan dan snapshot. */
export const PAYROLL_PROGRAMS: readonly PayrollConfigKey[] = [
  PayrollConfigKey.BPJS_KES,
  PayrollConfigKey.JHT,
  PayrollConfigKey.JP,
  PayrollConfigKey.JKK,
  PayrollConfigKey.JKM,
];

/** Bulatkan ke rupiah terdekat; tepat setengah rupiah dibulatkan ke atas. */
export function roundRupiah(value: Decimal): Decimal {
  return value.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}

/** Dasar upah BPJS: gaji pokok + tunjangan tetap. */
export function wageBase(salary: SalaryInput): Decimal {
  return salary.baseSalary.plus(salary.fixedAllowance);
}

/** Dasar upah satu program: tidak melebihi wageCap (jika ada). */
export function cappedWage(wage: Decimal, wageCap: Decimal | null): Decimal {
  return wageCap !== null && wage.greaterThan(wageCap) ? wageCap : wage;
}

/** Iuran satu program untuk satu tarif, sudah dibulatkan ke rupiah. */
export function contribution(
  wage: Decimal,
  rate: Decimal,
  wageCap: Decimal | null,
): Decimal {
  return roundRupiah(cappedWage(wage, wageCap).times(rate));
}

/** Potongan BPJS bagian karyawan (JKK dan JKM ditanggung perusahaan). */
export function employeeDeductions(
  salary: SalaryInput,
  rates: PayrollRates,
): EmployeeDeductions {
  const wage = wageBase(salary);
  const part = (key: PayrollConfigKey) =>
    contribution(wage, rates[key].employeeRate, rates[key].wageCap);
  return {
    bpjsKes: part(PayrollConfigKey.BPJS_KES),
    bpjsJht: part(PayrollConfigKey.JHT),
    bpjsJp: part(PayrollConfigKey.JP),
  };
}

/** Iuran bagian perusahaan per program dan totalnya. */
export function employerContributions(
  salary: SalaryInput,
  rates: PayrollRates,
): EmployerContributions {
  const wage = wageBase(salary);
  const result = {} as EmployerContributions;
  let total = new Prisma.Decimal(0);
  for (const key of PAYROLL_PROGRAMS) {
    const amount = contribution(
      wage,
      rates[key].employerRate,
      rates[key].wageCap,
    );
    result[key] = amount;
    total = total.plus(amount);
  }
  result.total = total;
  return result;
}

/** Bruto dan take home pay dari komponen slip. */
export function payslipTotals(
  parts: SalaryInput & ManualInput & EmployeeDeductions,
): { gross: Decimal; net: Decimal } {
  const gross = parts.baseSalary.plus(parts.fixedAllowance).plus(parts.bonus);
  const net = gross
    .minus(parts.bpjsKes)
    .minus(parts.bpjsJht)
    .minus(parts.bpjsJp)
    .minus(parts.pph21)
    .minus(parts.otherDeductions);
  return { gross, net };
}

/** Slip lengkap dari struktur gaji, isian HR, dan tarif periode. */
export function calculatePayslip(
  salary: SalaryInput,
  manual: ManualInput,
  rates: PayrollRates,
): PayslipAmounts {
  const deductions = employeeDeductions(salary, rates);
  // Field ditulis satu per satu: objek input yang membawa field lain
  // (misalnya baris slip lama) tidak bisa menimpa gaji atau potongan.
  const parts = {
    baseSalary: salary.baseSalary,
    fixedAllowance: salary.fixedAllowance,
    bonus: manual.bonus,
    pph21: manual.pph21,
    otherDeductions: manual.otherDeductions,
    ...deductions,
  };
  return {
    ...parts,
    ...payslipTotals(parts),
    employerContributions: employerContributions(salary, rates),
  };
}
