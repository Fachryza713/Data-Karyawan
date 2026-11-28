import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  parseDateOnly,
  toDateOnly,
} from '../../common/validation/date-only.js';
import {
  AttendanceMode,
  AttendanceStatus,
  LeaveRequestKind,
  LeaveRequestStatus,
} from '../../generated/prisma/enums.js';
import type { RemoteWorkMode } from '../attendance/remote-work.policy.js';
import {
  LeaveMessages,
  LeaveTypeCodes,
  MAX_ADVANCE_DAYS,
  MAX_BACKDATE_DAYS,
  STATUS_LABELS,
} from './leave.constants.js';

/**
 * Aturan pengajuan cuti/WFH/dinas tanpa I/O. Tanggal berupa teks
 * "YYYY-MM-DD" (kalender WIB), jadi perbandingan string sama dengan
 * perbandingan tanggal. Pelanggaran dilempar sebagai HttpException:
 * 400 bentuk input, 409 konflik status/data, 422 aturan bisnis.
 */

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** PENDING bisa menjadi APPROVED, REJECTED, atau CANCELLED. Sisanya final. */
export const LEAVE_STATUS_TRANSITIONS: Record<
  LeaveRequestStatus,
  readonly LeaveRequestStatus[]
> = {
  PENDING: [
    LeaveRequestStatus.APPROVED,
    LeaveRequestStatus.REJECTED,
    LeaveRequestStatus.CANCELLED,
  ],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function canTransition(
  from: LeaveRequestStatus,
  to: LeaveRequestStatus,
): boolean {
  return LEAVE_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * 409 jika status `from` tidak bisa berubah ke `to`. Ini cek awal untuk
 * pesan yang jelas; jaminan atomiknya tetap updateMany dengan
 * `status: PENDING` di where.
 */
export function assertTransition(
  from: LeaveRequestStatus,
  to: LeaveRequestStatus,
): void {
  if (!canTransition(from, to)) {
    throw new ConflictException(
      `Pengajuan ini sudah ${STATUS_LABELS[from]} dan tidak bisa diubah lagi`,
    );
  }
}

/** HR tidak boleh menyetujui/menolak pengajuannya sendiri (403). */
export function assertNotOwnRequest(
  requesterUserId: string,
  reviewerUserId: string,
): void {
  if (requesterUserId === reviewerUserId) {
    throw new ForbiddenException(LeaveMessages.ownRequest);
  }
}

// ---------------------------------------------------------------------------
// Tanggal
// ---------------------------------------------------------------------------

export type DateRange = { start: string; end: string };

/** Tanggal "YYYY-MM-DD" ditambah `days` hari (boleh negatif). */
export function addDays(date: string, days: number): string {
  return toDateOnly(new Date(parseDateOnly(date).getTime() + days * DAY_MS));
}

export function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

/** Dua rentang inklusif beririsan (berbagi minimal satu tanggal). */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}

export function assertDateRange(range: DateRange): void {
  if (range.start > range.end) {
    throw new BadRequestException(LeaveMessages.invalidRange);
  }
}

/**
 * Batas waktu pengajuan, `today` = tanggal WIB hari ini:
 * - WFH/dinas luar paling lambat H-1 (mulai minimal besok).
 * - Cuti/sakit/izin boleh mulai paling lama 7 hari ke belakang (sakit
 *   biasanya diajukan setelah kembali bekerja).
 * - Semua jenis selesai paling jauh 365 hari dari hari ini.
 */
export function assertSubmissionWindow(
  kind: LeaveRequestKind,
  range: DateRange,
  today: string,
): void {
  if (kind === LeaveRequestKind.LEAVE) {
    if (range.start < addDays(today, -MAX_BACKDATE_DAYS)) {
      throw new UnprocessableEntityException(LeaveMessages.tooFarBack);
    }
  } else if (range.start <= today) {
    throw new UnprocessableEntityException(LeaveMessages.remoteNoticeH1);
  }
  if (range.end > addDays(today, MAX_ADVANCE_DAYS)) {
    throw new UnprocessableEntityException(LeaveMessages.tooFarAhead);
  }
}

export function assertHasWorkingDays(
  workingDays: number,
  message: string = LeaveMessages.noWorkingDays,
): void {
  if (workingDays <= 0) {
    throw new UnprocessableEntityException(message);
  }
}

// ---------------------------------------------------------------------------
// Bentuk pengajuan per kind
// ---------------------------------------------------------------------------

export type RequestShape = {
  kind: LeaveRequestKind;
  leaveTypeId?: string;
  destination?: string;
  attachmentKey?: string;
};

/**
 * Field yang hanya berlaku untuk kind tertentu (400):
 * - LEAVE wajib leaveTypeId; hanya LEAVE yang boleh punya leaveTypeId dan lampiran.
 * - BUSINESS_TRIP wajib destination; kind lain tidak boleh mengisinya.
 */
export function assertRequestShape(input: RequestShape): void {
  const isLeave = input.kind === LeaveRequestKind.LEAVE;
  const isTrip = input.kind === LeaveRequestKind.BUSINESS_TRIP;
  if (isLeave && !input.leaveTypeId) {
    throw new BadRequestException(LeaveMessages.leaveTypeRequired);
  }
  if (!isLeave && input.leaveTypeId !== undefined) {
    throw new BadRequestException(LeaveMessages.leaveTypeOnlyForLeave);
  }
  if (!isLeave && input.attachmentKey !== undefined) {
    throw new BadRequestException(LeaveMessages.attachmentOnlyForLeave);
  }
  if (isTrip && !input.destination) {
    throw new BadRequestException(LeaveMessages.destinationRequired);
  }
  if (!isTrip && input.destination !== undefined) {
    throw new BadRequestException(LeaveMessages.destinationOnlyForTrip);
  }
}

// ---------------------------------------------------------------------------
// Jenis cuti: kuota dan lampiran
// ---------------------------------------------------------------------------

export type LeaveTypeRule = {
  code: string;
  name: string;
  deductsQuota: boolean;
  attachmentRequiredAfterDays: number | null;
};

/** Saldo per tahun mengikuti tanggal; cuti tahunan tidak boleh lintas tahun. */
export function assertSingleYear(type: LeaveTypeRule, range: DateRange): void {
  if (type.deductsQuota && yearOf(range.start) !== yearOf(range.end)) {
    throw new UnprocessableEntityException(LeaveMessages.crossYear);
  }
}

/** Lampiran wajib jika hari kerja lebih dari batas jenisnya (sakit > 1 hari). */
export function isAttachmentRequired(
  type: LeaveTypeRule,
  workingDays: number,
): boolean {
  return (
    type.attachmentRequiredAfterDays !== null &&
    workingDays > type.attachmentRequiredAfterDays
  );
}

export function assertAttachmentRule(
  type: LeaveTypeRule,
  workingDays: number,
  attachmentKey: string | undefined,
): void {
  if (isAttachmentRequired(type, workingDays) && !attachmentKey) {
    const after = type.attachmentRequiredAfterDays ?? 0;
    throw new UnprocessableEntityException({
      message:
        `${type.name} lebih dari ${after} hari kerja wajib melampirkan ` +
        'dokumen pendukung (misalnya surat dokter)',
      details: { workingDays, attachmentRequiredAfterDays: after },
    });
  }
}

export type BalanceSnapshot = { year: number; quota: number; used: number };

export function remainingDays(balance: BalanceSnapshot): number {
  return Math.max(balance.quota - balance.used, 0);
}

/**
 * Cuti tahunan tidak boleh melebihi sisa kuota (quota - used) tahun itu.
 * Pengajuan PENDING tidak memesan kuota; batas sebenarnya dijaga saat
 * approve dengan UPDATE bersyarat.
 */
export function assertWithinQuota(
  balance: BalanceSnapshot,
  workingDays: number,
): void {
  const remaining = remainingDays(balance);
  if (workingDays > remaining) {
    throw new UnprocessableEntityException({
      message: `${LeaveMessages.insufficientBalance}: sisa ${remaining} hari kerja di ${balance.year}, diajukan ${workingDays} hari kerja`,
      details: { year: balance.year, remainingDays: remaining, workingDays },
    });
  }
}

// ---------------------------------------------------------------------------
// Dampak ke presensi
// ---------------------------------------------------------------------------

/** Status presensi untuk hari cuti yang disetujui. */
export function attendanceStatusFor(
  leaveTypeCode: string,
):
  | typeof AttendanceStatus.LEAVE
  | typeof AttendanceStatus.SICK
  | typeof AttendanceStatus.PERMIT {
  if (leaveTypeCode === LeaveTypeCodes.sick) return AttendanceStatus.SICK;
  if (leaveTypeCode === LeaveTypeCodes.annual) return AttendanceStatus.LEAVE;
  return AttendanceStatus.PERMIT;
}

/** Mode absen untuk izin kerja di luar kantor. */
export function remoteModeFor(
  kind: typeof LeaveRequestKind.WFH | typeof LeaveRequestKind.BUSINESS_TRIP,
): RemoteWorkMode {
  return kind === LeaveRequestKind.WFH
    ? AttendanceMode.WFH
    : AttendanceMode.BUSINESS_TRIP;
}
