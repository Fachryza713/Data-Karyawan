import {
  ValidateBy,
  ValidateIf,
  type ValidationOptions,
} from 'class-validator';
import { isMoneyString, isRateString } from '../money/money.js';
import { isValidDateOnly, todayDateOnly } from './date-only.js';

/** Tanggal lahir paling awal yang diterima (sama dengan versi Supabase). */
export const MIN_BIRTH_DATE = '1900-01-01';

/**
 * Field opsional yang tidak boleh null. Berbeda dari @IsOptional() yang
 * melewatkan null: di sini hanya undefined (field tidak dikirim) yang
 * dilewati, jadi `{ "fullName": null }` tetap ditolak validator berikutnya.
 */
export const OptionalNonNull = () =>
  ValidateIf((_object: object, value: unknown) => value !== undefined);

/** Tanggal kalender "YYYY-MM-DD" yang valid. */
export function IsDateOnly(options?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isDateOnly',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && isValidDateOnly(value),
        defaultMessage: () => '$property harus tanggal berformat YYYY-MM-DD',
      },
    },
    options,
  );
}

/** Tanggal lahir: format YYYY-MM-DD, sejak 1900-01-01, sebelum hari ini (WIB). */
export function IsBirthDate(options?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isBirthDate',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          isValidDateOnly(value) &&
          value >= MIN_BIRTH_DATE &&
          value < todayDateOnly(),
        defaultMessage: () =>
          `$property harus tanggal YYYY-MM-DD antara ${MIN_BIRTH_DATE} dan kemarin`,
      },
    },
    options,
  );
}

/**
 * Uang sebagai teks desimal, contoh "8500000.00": >= 0, maksimal 13 digit
 * bulat dan 2 desimal. Angka JSON (float) ditolak.
 */
export function IsMoney(options?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isMoney',
      validator: {
        validate: (value: unknown) => isMoneyString(value),
        defaultMessage: () =>
          '$property harus nominal rupiah berupa teks, contoh "8500000" atau "8500000.50" (maks 2 desimal)',
      },
    },
    options,
  );
}

/** Tarif pecahan sebagai teks, 0 sampai 1 dengan maksimal 4 desimal ("0.0100" = 1%). */
export function IsRate(options?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isRate',
      validator: {
        validate: (value: unknown) => isRateString(value),
        defaultMessage: () =>
          '$property harus tarif pecahan berupa teks 0 sampai 1, contoh "0.0100" untuk 1% (maks 4 desimal)',
      },
    },
    options,
  );
}
