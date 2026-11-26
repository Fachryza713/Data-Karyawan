import { APP_TIME_ZONE } from '../../common/validation/date-only.js';
import { AttendanceStatus } from '../../generated/prisma/enums.js';
import type { AttendanceLogStatus } from './attendance.constants.js';

/**
 * Aturan presensi tanpa I/O: jam WIB, keterlambatan, pulang cepat, radius,
 * dan ringkasan bulanan. Dipakai AttendanceService dan diuji langsung.
 */

/** Waktu server dalam WIB. */
export type WibClock = {
  /** Tanggal kalender WIB, "YYYY-MM-DD". */
  date: string;
  /** Jam WIB, "HH:mm". */
  time: string;
  /** Detik sejak 00:00 WIB. */
  secondsOfDay: number;
};

const WIB_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function toWibClock(instant: Date): WibClock {
  const part: Record<string, string> = {};
  for (const { type, value } of WIB_FORMAT.formatToParts(instant)) {
    part[type] = value;
  }
  return {
    date: `${part.year}-${part.month}-${part.day}`,
    time: `${part.hour}:${part.minute}`,
    secondsOfDay:
      Number(part.hour) * 3600 + Number(part.minute) * 60 + Number(part.second),
  };
}

/** "08:30" menjadi detik sejak tengah malam. */
export function timeToSeconds(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60;
}

export type ShiftRule = {
  startTime: string;
  endTime: string;
  lateToleranceMin: number;
};

export type ClockInResult = {
  status: typeof AttendanceStatus.ON_TIME | typeof AttendanceStatus.LATE;
  lateMinutes: number;
};

/**
 * Tepat waktu jika masuk paling lambat jam masuk + toleransi (detik ikut
 * dihitung: 08:45:00 masih tepat waktu untuk 08:30 + 15, 08:45:01 tidak).
 * Menit terlambat dihitung dari jam masuk shift, dibulatkan ke bawah
 * (sama dengan versi Supabase), minimal 1 supaya LATE selalu punya menit
 * terlambat (toleransi 0, masuk 08:30:30 = terlambat 1 menit).
 */
export function evaluateClockIn(
  secondsOfDay: number,
  shift: ShiftRule,
): ClockInResult {
  const start = timeToSeconds(shift.startTime);
  if (secondsOfDay <= start + shift.lateToleranceMin * 60) {
    return { status: AttendanceStatus.ON_TIME, lateMinutes: 0 };
  }
  return {
    status: AttendanceStatus.LATE,
    lateMinutes: Math.max(1, Math.floor((secondsOfDay - start) / 60)),
  };
}

/** Pulang sebelum jam pulang shift. Tepat di jam pulang tidak dihitung cepat. */
export function isEarlyLeave(secondsOfDay: number, shift: ShiftRule): boolean {
  return secondsOfDay < timeToSeconds(shift.endTime);
}

/**
 * Jarak (meter, sudah dibulatkan) di luar radius kantor. Tepat di tepi
 * radius masih diterima. Jarak dibulatkan dulu supaya angka di pesan
 * penolakan sama dengan angka yang dibandingkan.
 */
export function isOutsideRadius(distanceM: number, radiusM: number): boolean {
  return distanceM > radiusM;
}

export type MonthSummary = {
  /** Hari dengan absen masuk (tepat waktu, terlambat, atau pulang cepat). */
  present: number;
  /** Hari dengan menit terlambat, termasuk yang kemudian pulang cepat. */
  late: number;
  earlyLeave: number;
  leave: number;
  sick: number;
  permit: number;
  absent: number;
};

export function summarizeMonth(
  rows: ReadonlyArray<{
    status: AttendanceLogStatus;
    clockInAt: Date | null;
    lateMinutes: number;
  }>,
): MonthSummary {
  const summary: MonthSummary = {
    present: 0,
    late: 0,
    earlyLeave: 0,
    leave: 0,
    sick: 0,
    permit: 0,
    absent: 0,
  };
  for (const row of rows) {
    if (row.clockInAt) summary.present++;
    if (row.lateMinutes > 0) summary.late++;
    if (row.status === AttendanceStatus.EARLY_LEAVE) summary.earlyLeave++;
    if (row.status === AttendanceStatus.LEAVE) summary.leave++;
    if (row.status === AttendanceStatus.SICK) summary.sick++;
    if (row.status === AttendanceStatus.PERMIT) summary.permit++;
    if (row.status === AttendanceStatus.ABSENT) summary.absent++;
  }
  return summary;
}

/** Tanggal pertama dan terakhir bulan "YYYY-MM". */
export function monthBounds(month: string): { from: string; to: string } {
  const [year, monthIndex] = month.split('-').map(Number);
  // Hari ke-0 bulan berikutnya = hari terakhir bulan ini.
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

export type DateRangeFilter = { date?: string; from?: string; to?: string };

/** Key pesan di AttendanceMessages. */
export type RangeErrorKey =
  'dateAndRange' | 'incompleteRange' | 'invalidRange' | 'rangeTooLong';

export type ResolvedRange = {
  from: string;
  to: string;
  /** Satu tanggal: log HR ikut menampilkan karyawan yang belum absen. */
  single: boolean;
};

const DAY_MS = 86_400_000;

/**
 * Tentukan rentang log HR: `date` saja, `from`+`to`, atau hari ini jika
 * keduanya kosong. Kombinasi yang salah menghasilkan key pesan error (400).
 */
export function resolveRange(
  filter: DateRangeFilter,
  today: string,
  maxDays: number,
): ResolvedRange | { error: RangeErrorKey } {
  const hasRange = filter.from !== undefined || filter.to !== undefined;
  if (filter.date !== undefined && hasRange) {
    return { error: 'dateAndRange' };
  }
  if (!hasRange) {
    const date = filter.date ?? today;
    return { from: date, to: date, single: true };
  }
  if (filter.from === undefined || filter.to === undefined) {
    return { error: 'incompleteRange' };
  }
  if (filter.to < filter.from) {
    return { error: 'invalidRange' };
  }
  const days =
    (Date.parse(`${filter.to}T00:00:00Z`) -
      Date.parse(`${filter.from}T00:00:00Z`)) /
      DAY_MS +
    1;
  if (days > maxDays) {
    return { error: 'rangeTooLong' };
  }
  return {
    from: filter.from,
    to: filter.to,
    single: filter.from === filter.to,
  };
}
