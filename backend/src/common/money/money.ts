import { Prisma } from '../../generated/prisma/client.js';

/**
 * Uang dan tarif selalu Prisma.Decimal, tidak pernah number. Di API uang
 * dikirim sebagai teks desimal ("8500000.00") karena angka JSON dibaca
 * JavaScript sebagai float.
 */

/** Rupiah untuk kolom Decimal(15, 2): maksimal 13 digit bulat, 2 desimal. */
export const MONEY_PATTERN = /^(0|[1-9]\d{0,12})(\.\d{1,2})?$/;

/** Tarif pecahan 0 sampai 1 untuk kolom Decimal(7, 4): 0.0100 = 1%. */
export const RATE_PATTERN = /^(0(\.\d{1,4})?|1(\.0{1,4})?)$/;

export const MONEY_EXAMPLE = '8500000.00';

export function isMoneyString(value: unknown): value is string {
  return typeof value === 'string' && MONEY_PATTERN.test(value);
}

export function isRateString(value: unknown): value is string {
  return typeof value === 'string' && RATE_PATTERN.test(value);
}

/** Teks uang yang sudah lolos MONEY_PATTERN menjadi Decimal. */
export function parseMoney(value: string): Prisma.Decimal {
  if (!MONEY_PATTERN.test(value)) {
    throw new RangeError(`Nominal uang tidak valid: ${value}`);
  }
  return new Prisma.Decimal(value);
}

/** Teks tarif yang sudah lolos RATE_PATTERN menjadi Decimal. */
export function parseRate(value: string): Prisma.Decimal {
  if (!RATE_PATTERN.test(value)) {
    throw new RangeError(`Tarif tidak valid: ${value}`);
  }
  return new Prisma.Decimal(value);
}

/** Uang untuk response/JSON: selalu 2 desimal, contoh "8500000.00". */
export function formatMoney(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

/** Tarif untuk response/JSON: selalu 4 desimal, contoh "0.0100". */
export function formatRate(value: Prisma.Decimal): string {
  return value.toFixed(4);
}

export function zeroMoney(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

export function sumMoney(values: Iterable<Prisma.Decimal>): Prisma.Decimal {
  let total = zeroMoney();
  for (const value of values) {
    total = total.plus(value);
  }
  return total;
}
