import {
  ValidateBy,
  ValidateIf,
  type ValidationOptions,
} from 'class-validator';
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
