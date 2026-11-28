import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Prisma } from '../../generated/prisma/client.js';
import {
  calculatePayslip,
  cappedWage,
  type PayrollRates,
  type PayslipAmounts,
  roundRupiah,
} from './payroll-calculator.js';

const d = (value: string) => new Prisma.Decimal(value);

/** Tarif seed migrasi (PRD 6.4). */
const RATES: PayrollRates = {
  BPJS_KES: {
    employeeRate: d('0.01'),
    employerRate: d('0.04'),
    wageCap: d('12000000'),
  },
  JHT: { employeeRate: d('0.02'), employerRate: d('0.037'), wageCap: null },
  JP: {
    employeeRate: d('0.01'),
    employerRate: d('0.02'),
    wageCap: d('10547400'),
  },
  JKK: { employeeRate: d('0'), employerRate: d('0.0024'), wageCap: null },
  JKM: { employeeRate: d('0'), employerRate: d('0.003'), wageCap: null },
};

/** Semua nilai sebagai teks 2 desimal supaya mudah dibandingkan. */
function asText(amounts: PayslipAmounts) {
  const { employerContributions, ...rest } = amounts;
  return {
    ...Object.fromEntries(
      Object.entries(rest).map(([key, value]) => [key, value.toFixed(2)]),
    ),
    employer: Object.fromEntries(
      Object.entries(employerContributions).map(([key, value]) => [
        key,
        value.toFixed(2),
      ]),
    ),
  };
}

type Row = {
  label: string;
  base: string;
  allowance: string;
  manual?: { bonus: string; pph21: string; otherDeductions: string };
  expected: {
    gross: string;
    bpjsKes: string;
    bpjsJht: string;
    bpjsJp: string;
    net: string;
    employer: Record<string, string>;
  };
};

const money = (value: number | string) => d(String(value)).toFixed(2);

// prettier-ignore
const CASES: Row[] = [
  {
    label: 'di bawah semua cap (upah 9.000.000)',
    base: '8000000', allowance: '1000000',
    expected: {
      gross: money(9000000), bpjsKes: money(90000), bpjsJht: money(180000), bpjsJp: money(90000),
      net: money(8640000),
      employer: { BPJS_KES: money(360000), JHT: money(333000), JP: money(180000), JKK: money(21600), JKM: money(27000), total: money(921600) },
    },
  },
  {
    label: 'di atas cap JP, di bawah cap BPJS Kes (upah 11.000.000)',
    base: '10000000', allowance: '1000000',
    expected: {
      gross: money(11000000), bpjsKes: money(110000), bpjsJht: money(220000),
      // JP memakai cap 10.547.400; JHT tetap upah penuh.
      bpjsJp: money(105474),
      net: money(10564526),
      employer: { BPJS_KES: money(440000), JHT: money(407000), JP: money(210948), JKK: money(26400), JKM: money(33000), total: money(1117348) },
    },
  },
  {
    label: 'di atas cap BPJS Kes (upah 15.000.000)',
    base: '13500000', allowance: '1500000',
    expected: {
      gross: money(15000000),
      // BPJS Kes memakai cap 12.000.000, JP cap 10.547.400.
      bpjsKes: money(120000), bpjsJht: money(300000), bpjsJp: money(105474),
      net: money(14474526),
      employer: { BPJS_KES: money(480000), JHT: money(555000), JP: money(210948), JKK: money(36000), JKM: money(45000), total: money(1326948) },
    },
  },
  {
    label: 'tepat di cap: tidak ada pemotongan dasar upah',
    base: '12000000', allowance: '0',
    expected: {
      gross: money(12000000), bpjsKes: money(120000), bpjsJht: money(240000), bpjsJp: money(105474),
      net: money(11534526),
      employer: { BPJS_KES: money(480000), JHT: money(444000), JP: money(210948), JKK: money(28800), JKM: money(36000), total: money(1199748) },
    },
  },
  {
    label: 'pembulatan ROUND_HALF_UP (upah 1.234.550)',
    base: '1234550', allowance: '0',
    expected: {
      gross: money(1234550),
      // 12.345,50 -> 12.346; 24.691,00; 12.345,50 -> 12.346
      bpjsKes: money(12346), bpjsJht: money(24691), bpjsJp: money(12346),
      net: money(1185167),
      // 45.678,35 -> 45.678; 2.962,92 -> 2.963; 3.703,65 -> 3.704
      employer: { BPJS_KES: money(49382), JHT: money(45678), JP: money(24691), JKK: money(2963), JKM: money(3704), total: money(126418) },
    },
  },
  {
    label: 'pembulatan ke bawah di bawah setengah (upah 1.234.549,99)',
    base: '1234549.99', allowance: '0',
    expected: {
      gross: '1234549.99',
      // 12.345,4999 -> 12.345; 24.690,9998 -> 24.691
      bpjsKes: money(12345), bpjsJht: money(24691), bpjsJp: money(12345),
      net: '1185168.99',
      employer: { BPJS_KES: money(49382), JHT: money(45678), JP: money(24691), JKK: money(2963), JKM: money(3704), total: money(126418) },
    },
  },
  {
    label: 'gaji 0',
    base: '0', allowance: '0',
    expected: {
      gross: money(0), bpjsKes: money(0), bpjsJht: money(0), bpjsJp: money(0), net: money(0),
      employer: { BPJS_KES: money(0), JHT: money(0), JP: money(0), JKK: money(0), JKM: money(0), total: money(0) },
    },
  },
  {
    label: 'gaji 0 dengan bonus: bonus tidak menjadi dasar upah BPJS',
    base: '0', allowance: '0',
    manual: { bonus: '1000000', pph21: '0', otherDeductions: '0' },
    expected: {
      gross: money(1000000), bpjsKes: money(0), bpjsJht: money(0), bpjsJp: money(0), net: money(1000000),
      employer: { BPJS_KES: money(0), JHT: money(0), JP: money(0), JKK: money(0), JKM: money(0), total: money(0) },
    },
  },
  {
    label: 'bonus, PPh 21, dan potongan lain di atas cap BPJS Kes',
    base: '13500000', allowance: '1500000',
    manual: { bonus: '2000000', pph21: '750000', otherDeductions: '100000' },
    expected: {
      gross: money(17000000), bpjsKes: money(120000), bpjsJht: money(300000), bpjsJp: money(105474),
      // 17.000.000 - 525.474 - 750.000 - 100.000
      net: money(15624526),
      employer: { BPJS_KES: money(480000), JHT: money(555000), JP: money(210948), JKK: money(36000), JKM: money(45000), total: money(1326948) },
    },
  },
];

describe('PayrollCalculator.calculatePayslip', () => {
  it.each(CASES)('$label', ({ base, allowance, manual, expected }) => {
    const result = calculatePayslip(
      { baseSalary: d(base), fixedAllowance: d(allowance) },
      {
        bonus: d(manual?.bonus ?? '0'),
        pph21: d(manual?.pph21 ?? '0'),
        otherDeductions: d(manual?.otherDeductions ?? '0'),
      },
      RATES,
    );

    expect(asText(result)).toMatchObject(expected);
    // Semua hasil tetap Prisma.Decimal.
    expect(Prisma.Decimal.isDecimal(result.net)).toBe(true);
    expect(Prisma.Decimal.isDecimal(result.employerContributions.total)).toBe(
      true,
    );
  });

  it('nilai di atas 2^53 tetap presisi (tidak lewat float)', () => {
    const result = calculatePayslip(
      { baseSalary: d('9999999999999.99'), fixedAllowance: d('0') },
      { bonus: d('0'), pph21: d('0'), otherDeductions: d('0') },
      RATES,
    );
    // JHT tanpa cap: 2% x 9.999.999.999.999,99 = 199.999.999.999,9998 -> ...200.000.000.000
    expect(result.bpjsJht.toFixed(2)).toBe('200000000000.00');
    expect(result.gross.toFixed(2)).toBe('9999999999999.99');
  });

  it('tarif dibaca dari konfigurasi, tidak di-hardcode', () => {
    const doubled: PayrollRates = {
      ...RATES,
      JHT: { ...RATES.JHT, employeeRate: d('0.04') },
    };
    const result = calculatePayslip(
      { baseSalary: d('9000000'), fixedAllowance: d('0') },
      { bonus: d('0'), pph21: d('0'), otherDeductions: d('0') },
      doubled,
    );
    expect(result.bpjsJht.toFixed(2)).toBe('360000.00');
  });
});

describe('roundRupiah dan cappedWage', () => {
  it.each([
    ['0.5', '1'],
    ['1.5', '2'],
    ['2.4999', '2'],
    ['12345.5', '12346'],
    ['0.49', '0'],
  ])('%s -> %s', (input, output) => {
    expect(roundRupiah(d(input)).toFixed(0)).toBe(output);
  });

  it('cap null = tanpa batas; upah di bawah cap tidak berubah', () => {
    expect(cappedWage(d('20000000'), null).toFixed(0)).toBe('20000000');
    expect(cappedWage(d('5000000'), d('12000000')).toFixed(0)).toBe('5000000');
    expect(cappedWage(d('20000000'), d('12000000')).toFixed(0)).toBe(
      '12000000',
    );
  });
});

describe('PayrollCalculator tanpa konversi number', () => {
  it('sumber kalkulator tidak memakai toNumber/Number()/parseFloat/parseInt', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./payroll-calculator.ts', import.meta.url)),
      'utf-8',
    );
    // Komentar boleh menyebutnya; yang diperiksa kodenya.
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(code).not.toMatch(
      /\.toNumber\(|\bNumber\(|parseFloat|parseInt|Math\./,
    );
  });
});
