import {
  AttendanceMode,
  AttendanceStatus,
} from '../../generated/prisma/enums.js';

/** Akurasi GPS terburuk yang masih diterima (meter). */
export const MAX_GPS_ACCURACY_M = 100;

/** Rentang tanggal terpanjang untuk log dan ekspor HR (hari, inklusif). */
export const MAX_RANGE_DAYS = 93;

/** Jumlah baris per query saat menulis CSV ekspor. */
export const EXPORT_BATCH_SIZE = 500;

/** Status turunan untuk log HR: karyawan belum punya baris absensi. */
export const NOT_YET = 'NOT_YET';
export type AttendanceLogStatus = AttendanceStatus | typeof NOT_YET;
export const ATTENDANCE_LOG_STATUSES = [
  ...Object.values(AttendanceStatus),
  NOT_YET,
] as const;

export const STATUS_LABELS: Record<AttendanceLogStatus, string> = {
  ON_TIME: 'Tepat waktu',
  LATE: 'Terlambat',
  EARLY_LEAVE: 'Pulang cepat',
  LEAVE: 'Cuti',
  SICK: 'Sakit',
  PERMIT: 'Izin',
  ABSENT: 'Alpa',
  NOT_YET: 'Belum absen',
};

export const MODE_LABELS: Record<AttendanceMode, string> = {
  OFFICE: 'Kantor',
  WFH: 'WFH',
  BUSINESS_TRIP: 'Dinas luar',
};

/** Job penandaan alpa: lock per tanggal supaya hanya satu instance yang jalan. */
export const MARK_ABSENT_CRON = '59 23 * * *';
export const MARK_ABSENT_LOCK_PREFIX = 'lock:attendance:mark-absent:';
export const MARK_ABSENT_LOCK_TTL_MS = 15 * 60 * 1000;

export const AttendanceMessages = {
  alreadyClockedIn: 'Anda sudah absen masuk hari ini',
  alreadyClockedOut: 'Anda sudah absen pulang hari ini',
  notClockedIn: 'Anda belum absen masuk hari ini',
  notWorkingDay:
    'Hari ini bukan hari kerja (akhir pekan atau hari libur), absen tidak dibuka',
  dateAndRange: 'Pakai date atau from-to, tidak keduanya',
  incompleteRange: 'from dan to harus diisi bersama',
  invalidRange: 'to tidak boleh sebelum from',
  rangeTooLong: `Rentang tanggal maksimal ${MAX_RANGE_DAYS} hari`,
  notYetNeedsSingleDate: 'status NOT_YET hanya bisa dipakai untuk satu tanggal',
} as const;
