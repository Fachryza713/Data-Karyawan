import { Transform } from 'class-transformer';
import { composePropertyDecorators } from '../../../common/decorators/compose.js';
import {
  IsEmail,
  IsEnum,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  FULL_NAME_MAX_LENGTH,
  NIP_PATTERN,
  normalizeEmail,
  normalizeNip,
  PHONE_PATTERN,
} from '../../../common/validation/formats.js';
import { EmploymentStatus, Gender } from '../../../generated/prisma/enums.js';

// Aturan validasi field karyawan yang dipakai bersama oleh DTO create,
// update HR, dan update profil sendiri. Optional/null diatur di tiap DTO.

type TransformArgs = { value: unknown };

const trim = ({ value }: TransformArgs) =>
  typeof value === 'string' ? value.trim() : value;

export const EmailField = () =>
  composePropertyDecorators(
    Transform(({ value }: TransformArgs) =>
      typeof value === 'string' ? normalizeEmail(value) : value,
    ),
    IsEmail({}, { message: 'Format email tidak valid' }),
    MaxLength(254, { message: 'Email maksimal 254 karakter' }),
  );

/** NIP dirapikan (trim, huruf besar) sebelum dicek formatnya. */
export const NipField = () =>
  composePropertyDecorators(
    Transform(({ value }: TransformArgs) =>
      typeof value === 'string' ? normalizeNip(value) : value,
    ),
    IsString({ message: 'NIP harus berupa teks' }),
    Matches(NIP_PATTERN, {
      message: 'NIP harus berformat BRT-YYYY-NNNN, contoh BRT-2026-0001',
    }),
  );

export const FullNameField = () =>
  composePropertyDecorators(
    Transform(trim),
    IsString({ message: 'Nama lengkap harus berupa teks' }),
    MinLength(1, { message: 'Nama lengkap wajib diisi' }),
    MaxLength(FULL_NAME_MAX_LENGTH, {
      message: `Nama lengkap maksimal ${FULL_NAME_MAX_LENGTH} karakter`,
    }),
  );

/** String kosong dianggap null (hapus nomor telepon). */
export const PhoneField = () =>
  composePropertyDecorators(
    Transform(({ value }: TransformArgs) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }),
    IsString({ message: 'Nomor telepon harus berupa teks' }),
    Matches(PHONE_PATTERN, {
      message:
        'Nomor telepon tidak valid (8-20 karakter: angka, spasi, -, boleh diawali +)',
    }),
  );

export const GenderField = () =>
  IsEnum(Gender, { message: 'gender harus MALE atau FEMALE' });

export const EmploymentStatusField = () =>
  IsEnum(EmploymentStatus, {
    message: 'employmentStatus harus PERMANENT atau CONTRACT',
  });

export const UuidField = () =>
  IsUUID('all', { message: '$property harus UUID' });
