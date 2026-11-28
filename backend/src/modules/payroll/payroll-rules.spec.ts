import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PayrollPeriodStatus } from '../../generated/prisma/enums.js';
import {
  assertConfigUpdate,
  assertDraft,
  assertFinalizable,
  assertNetNotNegative,
  assertPeriodCreatable,
  assertPeriodTransition,
  canTransitionPeriod,
  type ConfigRow,
  effectiveStructure,
  nextMonthOf,
  periodBounds,
  resolveRates,
} from './payroll-rules.js';
import { PayrollMessages } from './payroll.constants.js';

const d = (value: string) => new Prisma.Decimal(value);
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const { DRAFT, FINAL, PAID } = PayrollPeriodStatus;

describe('transisi status periode', () => {
  it.each([
    [DRAFT, FINAL],
    [FINAL, PAID],
    [FINAL, DRAFT],
  ] as const)('%s -> %s boleh', (from, to) => {
    expect(canTransitionPeriod(from, to)).toBe(true);
    expect(() => assertPeriodTransition(from, to)).not.toThrow();
  });

  it.each([
    [DRAFT, PAID],
    [DRAFT, DRAFT],
    [FINAL, FINAL],
    [PAID, DRAFT],
    [PAID, FINAL],
    [PAID, PAID],
  ] as const)('%s -> %s ditolak 409', (from, to) => {
    expect(canTransitionPeriod(from, to)).toBe(false);
    expect(() => assertPeriodTransition(from, to)).toThrow(ConflictException);
  });

  it('PAID tidak bisa dibuka lagi: pesan khusus', () => {
    expect(() => assertPeriodTransition(PAID, DRAFT)).toThrow(
      new ConflictException(PayrollMessages.paidIsFinal),
    );
  });

  it('run/ubah slip hanya saat DRAFT', () => {
    expect(() => assertDraft(DRAFT)).not.toThrow();
    expect(() => assertDraft(FINAL)).toThrow(/Buka kembali/);
    expect(() => assertDraft(PAID)).toThrow(ConflictException);
  });
});

describe('periode', () => {
  it.each([
    ['2026-02', '2026-02-01', '2026-02-28'],
    ['2028-02', '2028-02-01', '2028-02-29'],
    ['2026-12', '2026-12-01', '2026-12-31'],
    ['2026-11', '2026-11-01', '2026-11-30'],
  ])('batas %s', (period, start, end) => {
    expect(periodBounds(period)).toEqual({ start, end });
  });

  it('bulan berikutnya, termasuk pergantian tahun', () => {
    expect(nextMonthOf('2026-11-26')).toBe('2026-12');
    expect(nextMonthOf('2026-12-31')).toBe('2027-01');
  });

  it('periode paling jauh bulan depan', () => {
    expect(() => assertPeriodCreatable('2026-12', '2026-11-26')).not.toThrow();
    expect(() => assertPeriodCreatable('2020-01', '2026-11-26')).not.toThrow();
    expect(() => assertPeriodCreatable('2027-01', '2026-11-26')).toThrow(
      new UnprocessableEntityException(PayrollMessages.periodTooFar),
    );
    expect(() => assertPeriodCreatable('2027-01', '2026-12-01')).not.toThrow();
  });
});

describe('slip', () => {
  it('take home pay negatif ditolak, nol boleh', () => {
    expect(() => assertNetNotNegative(d('0'))).not.toThrow();
    expect(() => assertNetNotNegative(d('-0.01'))).toThrow(
      new UnprocessableEntityException(PayrollMessages.negativeNet),
    );
  });

  it('finalize: periode kosong ditolak', () => {
    expect(() => assertFinalizable([])).toThrow(
      new UnprocessableEntityException(PayrollMessages.emptyPeriod),
    );
  });

  it('finalize: slip negatif disebut di details', () => {
    const items = [
      { id: 'a', nip: 'BRT-2024-0001', employeeName: 'A', net: d('100') },
      { id: 'b', nip: 'BRT-2024-0002', employeeName: 'B', net: d('-5') },
    ];
    const error = (() => {
      try {
        assertFinalizable(items);
      } catch (e) {
        return e as UnprocessableEntityException;
      }
    })();
    expect(error?.getResponse()).toMatchObject({
      message: PayrollMessages.negativeNetAtFinalize,
      details: {
        items: [
          { id: 'b', nip: 'BRT-2024-0002', employeeName: 'B', net: '-5.00' },
        ],
      },
    });
    expect(() => assertFinalizable([items[0]])).not.toThrow();
  });
});

describe('resolveRates', () => {
  const row = (
    key: ConfigRow['key'],
    effectiveFrom: string,
    employeeRate: string,
    wageCap: string | null = null,
  ): ConfigRow => ({
    key,
    employeeRate: d(employeeRate),
    employerRate: d('0.01'),
    wageCap: wageCap ? d(wageCap) : null,
    effectiveFrom: day(effectiveFrom),
  });
  const base = [
    row('BPJS_KES', '2025-03-01', '0.01', '12000000'),
    row('JHT', '2025-03-01', '0.02'),
    row('JP', '2025-03-01', '0.01', '10547400'),
    row('JKK', '2025-03-01', '0'),
    row('JKM', '2025-03-01', '0'),
  ];

  it('memilih effectiveFrom terbaru <= tanggal, tarif lama tetap dipakai periode lama', () => {
    const rows = [...base, row('JP', '2026-03-01', '0.01', '11000000')];

    expect(resolveRates(rows, '2026-02-01').rates.JP.wageCap?.toFixed(0)).toBe(
      '10547400',
    );
    expect(resolveRates(rows, '2026-03-01').rates.JP.wageCap?.toFixed(0)).toBe(
      '11000000',
    );
    expect(resolveRates(rows, '2026-03-01').rows.JP.effectiveFrom).toEqual(
      day('2026-03-01'),
    );
  });

  it('tarif yang belum berlaku diabaikan; program tanpa tarif = 422', () => {
    const error = (() => {
      try {
        resolveRates(base.slice(0, 4), '2026-01-01');
      } catch (e) {
        return e as UnprocessableEntityException;
      }
    })();
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error?.getResponse()).toMatchObject({
      details: { missing: ['JKM'] },
    });
    expect(() => resolveRates(base, '2025-02-01')).toThrow(
      UnprocessableEntityException,
    );
  });
});

describe('assertConfigUpdate', () => {
  const input = (key: 'JP' | 'JKK', employeeRate = '0.01', wageCap = '1') => ({
    key,
    employeeRate: d(employeeRate),
    employerRate: d('0.02'),
    wageCap: wageCap === 'null' ? null : d(wageCap),
  });

  it('effectiveFrom harus tanggal 1', () => {
    expect(() => assertConfigUpdate('2026-03-01', [input('JP')])).not.toThrow();
    expect(() => assertConfigUpdate('2026-03-15', [input('JP')])).toThrow(
      new UnprocessableEntityException(PayrollMessages.firstOfMonth),
    );
  });

  it('program ganda di body ditolak 400', () => {
    expect(() =>
      assertConfigUpdate('2026-03-01', [input('JP'), input('JP')]),
    ).toThrow(new BadRequestException(PayrollMessages.duplicateConfigKey));
  });

  it('JKK/JKM tanpa bagian karyawan', () => {
    expect(() =>
      assertConfigUpdate('2026-03-01', [input('JKK', '0', 'null')]),
    ).not.toThrow();
    expect(() =>
      assertConfigUpdate('2026-03-01', [input('JKK', '0.001', 'null')]),
    ).toThrow(UnprocessableEntityException);
  });

  it('wageCap 0 ditolak; null = tanpa batas', () => {
    expect(() =>
      assertConfigUpdate('2026-03-01', [input('JP', '0.01', '0')]),
    ).toThrow(
      new UnprocessableEntityException(PayrollMessages.wageCapPositive),
    );
    expect(() =>
      assertConfigUpdate('2026-03-01', [input('JP', '0.01', 'null')]),
    ).not.toThrow();
  });
});

describe('effectiveStructure', () => {
  const s = (id: string, effectiveFrom: string, createdAt: string) => ({
    id,
    effectiveFrom: day(effectiveFrom),
    createdAt: new Date(createdAt),
  });
  const rows = [
    s('a', '2024-01-01', '2024-01-01T00:00:00Z'),
    s('b', '2026-10-01', '2026-09-20T00:00:00Z'),
    // Koreksi untuk tanggal yang sama: yang dibuat terakhir menang.
    s('c', '2026-10-01', '2026-09-25T00:00:00Z'),
    s('d', '2027-01-01', '2026-11-01T00:00:00Z'),
  ];

  it.each([
    ['2023-12-31', null],
    ['2026-09-30', 'a'],
    ['2026-10-01', 'c'],
    ['2026-12-31', 'c'],
    ['2027-01-01', 'd'],
  ])('pada %s -> %s', (date, expected) => {
    expect(effectiveStructure(rows, date)?.id ?? null).toBe(expected);
  });
});
