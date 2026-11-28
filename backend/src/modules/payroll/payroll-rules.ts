import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  parseDateOnly,
  toDateOnly,
} from '../../common/validation/date-only.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  PayrollConfigKey,
  PayrollPeriodStatus,
} from '../../generated/prisma/enums.js';
import { PAYROLL_PROGRAMS, type PayrollRates } from './payroll-calculator.js';
import { PayrollMessages, PERIOD_STATUS_LABELS } from './payroll.constants.js';

/**
 * Aturan payroll tanpa I/O. Pelanggaran dilempar sebagai HttpException:
 * 400 bentuk input, 409 konflik status/data, 422 aturan bisnis.
 */

// ---------------------------------------------------------------------------
// Status periode
// ---------------------------------------------------------------------------

/**
 * DRAFT -> FINAL (finalize), FINAL -> PAID (mark-paid), FINAL -> DRAFT
 * (reopen). PAID final: tidak bisa dibuka lagi.
 */
export const PERIOD_TRANSITIONS: Record<
  PayrollPeriodStatus,
  readonly PayrollPeriodStatus[]
> = {
  DRAFT: [PayrollPeriodStatus.FINAL],
  FINAL: [PayrollPeriodStatus.PAID, PayrollPeriodStatus.DRAFT],
  PAID: [],
};

export function canTransitionPeriod(
  from: PayrollPeriodStatus,
  to: PayrollPeriodStatus,
): boolean {
  return PERIOD_TRANSITIONS[from].includes(to);
}

/** 409 jika status periode tidak bisa berubah dari `from` ke `to`. */
export function assertPeriodTransition(
  from: PayrollPeriodStatus,
  to: PayrollPeriodStatus,
): void {
  if (canTransitionPeriod(from, to)) {
    return;
  }
  if (from === PayrollPeriodStatus.PAID) {
    throw new ConflictException(PayrollMessages.paidIsFinal);
  }
  throw new ConflictException(
    `Payroll berstatus ${PERIOD_STATUS_LABELS[from]} tidak bisa diubah menjadi ${PERIOD_STATUS_LABELS[to]}`,
  );
}

/** Run dan ubah slip hanya saat DRAFT (409). */
export function assertDraft(status: PayrollPeriodStatus): void {
  if (status !== PayrollPeriodStatus.DRAFT) {
    throw new ConflictException(
      `Payroll berstatus ${PERIOD_STATUS_LABELS[status]} tidak bisa diubah. ${
        status === PayrollPeriodStatus.FINAL
          ? 'Buka kembali (reopen) terlebih dahulu.'
          : PayrollMessages.paidIsFinal
      }`,
    );
  }
}

// ---------------------------------------------------------------------------
// Periode "YYYY-MM"
// ---------------------------------------------------------------------------

export type PeriodBounds = { start: string; end: string };

/** Tanggal pertama dan terakhir bulan "YYYY-MM". */
export function periodBounds(period: string): PeriodBounds {
  const [year, month] = period.split('-').map((part) => Number(part));
  // Hari ke-0 bulan berikutnya = hari terakhir bulan ini.
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${period}-01`,
    end: `${period}-${String(last).padStart(2, '0')}`,
  };
}

/** "YYYY-MM" bulan berikutnya dari tanggal "YYYY-MM-DD". */
export function nextMonthOf(date: string): string {
  const [year, month] = date.split('-').map((part) => Number(part));
  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** Payroll paling jauh dibuat untuk bulan depan (versi Supabase). */
export function assertPeriodCreatable(period: string, today: string): void {
  if (period > nextMonthOf(today)) {
    throw new UnprocessableEntityException(PayrollMessages.periodTooFar);
  }
}

// ---------------------------------------------------------------------------
// Slip
// ---------------------------------------------------------------------------

/** Take home pay negatif ditolak saat HR mengubah slip (422). */
export function assertNetNotNegative(net: Prisma.Decimal): void {
  if (net.isNegative()) {
    throw new UnprocessableEntityException(PayrollMessages.negativeNet);
  }
}

type FinalizeCandidate = {
  id: string;
  nip: string;
  employeeName: string;
  net: Prisma.Decimal;
};

/** Finalize butuh minimal satu slip dan tidak ada take home pay negatif (422). */
export function assertFinalizable(items: readonly FinalizeCandidate[]): void {
  if (items.length === 0) {
    throw new UnprocessableEntityException(PayrollMessages.emptyPeriod);
  }
  const negative = items.filter((item) => item.net.isNegative());
  if (negative.length > 0) {
    throw new UnprocessableEntityException({
      message: PayrollMessages.negativeNetAtFinalize,
      details: {
        items: negative.map((item) => ({
          id: item.id,
          nip: item.nip,
          employeeName: item.employeeName,
          net: item.net.toFixed(2),
        })),
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Tarif
// ---------------------------------------------------------------------------

export type ConfigRow = {
  key: PayrollConfigKey;
  employeeRate: Prisma.Decimal;
  employerRate: Prisma.Decimal;
  wageCap: Prisma.Decimal | null;
  effectiveFrom: Date;
};

export type ResolvedRates = {
  rates: PayrollRates;
  /** Baris yang dipakai per program (untuk configSnapshot). */
  rows: Record<PayrollConfigKey, ConfigRow>;
};

/**
 * Tarif yang berlaku pada `date`: per program, baris dengan effectiveFrom
 * terbaru yang <= date. 422 jika ada program yang belum punya tarif.
 */
export function resolveRates(
  rows: readonly ConfigRow[],
  date: string,
): ResolvedRates {
  const chosen: Partial<Record<PayrollConfigKey, ConfigRow>> = {};
  for (const row of rows) {
    if (toDateOnly(row.effectiveFrom) > date) continue;
    const current = chosen[row.key];
    if (!current || row.effectiveFrom > current.effectiveFrom) {
      chosen[row.key] = row;
    }
  }
  const missing = PAYROLL_PROGRAMS.filter((key) => !chosen[key]);
  if (missing.length > 0) {
    throw new UnprocessableEntityException({
      message: `Tarif ${missing.join(', ')} belum diatur untuk tanggal ${date}`,
      details: { missing, date },
    });
  }
  const resolved = chosen as Record<PayrollConfigKey, ConfigRow>;
  const rates = {} as PayrollRates;
  for (const key of PAYROLL_PROGRAMS) {
    const { employeeRate, employerRate, wageCap } = resolved[key];
    rates[key] = { employeeRate, employerRate, wageCap };
  }
  return { rates, rows: resolved };
}

export type ConfigInput = {
  key: PayrollConfigKey;
  employeeRate: Prisma.Decimal;
  employerRate: Prisma.Decimal;
  wageCap: Prisma.Decimal | null;
};

const EMPLOYER_ONLY: readonly PayrollConfigKey[] = [
  PayrollConfigKey.JKK,
  PayrollConfigKey.JKM,
];

/**
 * Tarif baru: berlaku mulai tanggal 1 (payroll memakai tarif awal bulan),
 * satu baris per program, JKK/JKM tanpa bagian karyawan, wageCap > 0.
 */
export function assertConfigUpdate(
  effectiveFrom: string,
  configs: readonly ConfigInput[],
): void {
  if (!effectiveFrom.endsWith('-01')) {
    throw new UnprocessableEntityException(PayrollMessages.firstOfMonth);
  }
  const keys = configs.map((config) => config.key);
  if (new Set(keys).size !== keys.length) {
    throw new BadRequestException(PayrollMessages.duplicateConfigKey);
  }
  for (const config of configs) {
    if (EMPLOYER_ONLY.includes(config.key) && !config.employeeRate.isZero()) {
      throw new UnprocessableEntityException(
        `${config.key} ditanggung penuh perusahaan: employeeRate harus 0`,
      );
    }
    // isPositive() decimal.js menganggap 0 positif; batas upah harus > 0.
    if (config.wageCap !== null && config.wageCap.lessThanOrEqualTo(0)) {
      throw new UnprocessableEntityException(PayrollMessages.wageCapPositive);
    }
  }
}

// ---------------------------------------------------------------------------
// Struktur gaji
// ---------------------------------------------------------------------------

export type DatedStructure = {
  id: string;
  effectiveFrom: Date;
  createdAt: Date;
};

/**
 * Struktur gaji yang berlaku pada `date`: effectiveFrom terbaru <= date;
 * jika sama, yang dibuat terakhir (koreksi). Null jika belum ada.
 */
export function effectiveStructure<T extends DatedStructure>(
  structures: readonly T[],
  date: string,
): T | null {
  const limit = parseDateOnly(date);
  let best: T | null = null;
  for (const structure of structures) {
    if (structure.effectiveFrom > limit) continue;
    if (
      !best ||
      structure.effectiveFrom > best.effectiveFrom ||
      (structure.effectiveFrom.getTime() === best.effectiveFrom.getTime() &&
        (structure.createdAt > best.createdAt ||
          (structure.createdAt.getTime() === best.createdAt.getTime() &&
            structure.id > best.id)))
    ) {
      best = structure;
    }
  }
  return best;
}
