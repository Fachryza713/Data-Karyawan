import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { composePropertyDecorators } from '../decorators/compose.js';

type TransformArgs = { value: unknown };

/** Buang spasi di tepi teks; nilai selain string dibiarkan untuk validator. */
export const trimString = ({ value }: TransformArgs) =>
  typeof value === 'string' ? value.trim() : value;

/** Query pencarian: spasi di tepi dibuang, teks kosong dianggap tidak mencari. */
export const toSearchTerm = ({ value }: TransformArgs) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/** Panjang maksimal nama data master (departemen, kantor, shift, libur). */
export const MASTER_NAME_MAX_LENGTH = 100;

/** Nama data master: di-trim, wajib diisi, maksimal `maxLength` karakter. */
export const NameField = (maxLength = MASTER_NAME_MAX_LENGTH) =>
  composePropertyDecorators(
    Transform(trimString),
    IsString({ message: 'Nama harus berupa teks' }),
    MinLength(1, { message: 'Nama wajib diisi' }),
    MaxLength(maxLength, { message: `Nama maksimal ${maxLength} karakter` }),
  );
