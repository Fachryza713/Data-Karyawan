import { Prisma } from '../generated/prisma/client.js';

/** SQLSTATE PostgreSQL: pelanggaran EXCLUDE constraint. */
export const PG_EXCLUSION_VIOLATION = '23P01';

/** Error Prisma dengan kode tertentu, contoh P2002 (unique) atau P2025. */
export function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

/**
 * Kode error asli PostgreSQL (SQLSTATE) di balik error Prisma, atau null.
 * Error yang tidak punya kode Prisma sendiri (contoh EXCLUDE constraint,
 * 23P01) tetap membawa kode aslinya di meta.driverAdapterError (Prisma 7
 * dengan driver adapter pg).
 */
export function postgresErrorCode(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return null;
  }
  const adapterError = error.meta?.driverAdapterError as
    { cause?: { originalCode?: unknown } } | undefined;
  const code = adapterError?.cause?.originalCode;
  return typeof code === 'string' ? code : null;
}
