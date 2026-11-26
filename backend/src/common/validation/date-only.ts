/**
 * Tanggal kalender (kolom @db.Date) sebagai teks "YYYY-MM-DD".
 * Prisma menyimpan kolom date sebagai tengah malam UTC, jadi konversinya
 * selalu lewat UTC supaya tanggal tidak bergeser karena zona waktu.
 */

/** Zona waktu bisnis: presensi, cuti, dan payroll dihitung dalam WIB. */
export const APP_TIME_ZONE = 'Asia/Jakarta';

export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Format benar dan tanggalnya ada (2026-02-30 ditolak). */
export function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && toDateOnly(date) === value;
}

export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Tanggal hari ini di WIB, "YYYY-MM-DD". */
export function todayDateOnly(now = new Date()): string {
  // Locale en-CA memformat tanggal sebagai YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
