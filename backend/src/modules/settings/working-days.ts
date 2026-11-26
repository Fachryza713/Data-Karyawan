import {
  isValidDateOnly,
  parseDateOnly,
  toWibDateOnly,
} from '../../common/validation/date-only.js';

/**
 * Perhitungan hari kerja tanpa database. Hari kerja = Senin-Jumat yang bukan
 * hari libur. Semua tanggal berupa teks "YYYY-MM-DD" (kalender WIB), jadi
 * perbandingan string sama dengan perbandingan tanggal.
 */

/** Tanggal "YYYY-MM-DD", atau Date yang dibaca sebagai tanggal WIB. */
export type DateInput = string | Date;

const SUNDAY = 0;
const SATURDAY = 6;
const DAY_MS = 86_400_000;

/** Ubah input menjadi "YYYY-MM-DD". Melempar RangeError jika tidak valid. */
export function toCalendarDate(input: DateInput): string {
  if (typeof input === 'string') {
    if (!isValidDateOnly(input)) {
      throw new RangeError(`Tanggal tidak valid: ${input}`);
    }
    return input;
  }
  if (Number.isNaN(input.getTime())) {
    throw new RangeError('Tanggal tidak valid: Invalid Date');
  }
  return toWibDateOnly(input);
}

function dayOfWeek(date: string): number {
  return parseDateOnly(date).getUTCDay();
}

export function isWeekend(date: string): boolean {
  const day = dayOfWeek(date);
  return day === SATURDAY || day === SUNDAY;
}

/** Jumlah Senin-Jumat dari start sampai end (inklusif). */
function countWeekdays(start: string, end: string): number {
  const totalDays =
    (parseDateOnly(end).getTime() - parseDateOnly(start).getTime()) / DAY_MS +
    1;
  let weekdays = Math.floor(totalDays / 7) * 5;
  // Sisa hari setelah minggu penuh, dihitung dari hari pertama.
  const startDay = dayOfWeek(start);
  for (let offset = 0; offset < totalDays % 7; offset++) {
    const day = (startDay + offset) % 7;
    if (day !== SATURDAY && day !== SUNDAY) {
      weekdays++;
    }
  }
  return weekdays;
}

/**
 * Jumlah hari kerja dari start sampai end, keduanya ikut dihitung. Hari libur
 * yang jatuh di akhir pekan tidak mengurangi dua kali. start setelah end
 * menghasilkan 0 (sama dengan working_days di versi Supabase).
 */
export function countWorkingDays(
  start: string,
  end: string,
  holidays: Iterable<string>,
): number {
  if (start > end) {
    return 0;
  }
  let workingDays = countWeekdays(start, end);
  for (const holiday of new Set(holidays)) {
    if (holiday >= start && holiday <= end && !isWeekend(holiday)) {
      workingDays--;
    }
  }
  return workingDays;
}
