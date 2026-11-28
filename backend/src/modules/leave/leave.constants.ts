import { randomUUID } from 'node:crypto';
import type {
  LeaveRequestKind,
  LeaveRequestStatus,
} from '../../generated/prisma/enums.js';

/** Kode jenis cuti dari migrasi `leave_requests` (PRD 6.3). */
export const LeaveTypeCodes = {
  annual: 'ANNUAL',
  sick: 'SICK',
  special: 'SPECIAL',
} as const;

/** Cuti/sakit/izin boleh dimulai paling lama 7 hari ke belakang (versi Supabase). */
export const MAX_BACKDATE_DAYS = 7;
/** Tanggal selesai paling jauh 1 tahun dari hari ini (versi Supabase). */
export const MAX_ADVANCE_DAYS = 365;

export const REASON_MAX_LENGTH = 500;
export const DESTINATION_MAX_LENGTH = 200;
export const REVIEW_NOTE_MAX_LENGTH = 500;
export const ATTACHMENT_KEY_MAX_LENGTH = 200;

/** Presigned URL lampiran untuk HR berlaku 5 menit. */
export const ATTACHMENT_URL_TTL_SECONDS = 5 * 60;

/**
 * Job saldo cuti: 1 Januari 00:05 WIB. Tanpa lock Redis karena idempotent
 * (unique employeeId + year, insert dengan skipDuplicates).
 */
export const LEAVE_BALANCE_CRON = '5 0 1 1 *';

export const LEAVE_REQUEST_ENTITY = 'LeaveRequest';

export const LeaveAuditActions = {
  submit: 'leave_request.submit',
  cancel: 'leave_request.cancel',
  approve: 'leave_request.approve',
  reject: 'leave_request.reject',
} as const;

export const KIND_LABELS: Record<LeaveRequestKind, string> = {
  LEAVE: 'Cuti/izin',
  WFH: 'WFH',
  BUSINESS_TRIP: 'Dinas luar',
};

export const STATUS_LABELS: Record<LeaveRequestStatus, string> = {
  PENDING: 'menunggu',
  APPROVED: 'disetujui',
  REJECTED: 'ditolak',
  CANCELLED: 'dibatalkan',
};

export const LeaveMessages = {
  notFound: 'Pengajuan tidak ditemukan',
  leaveTypeNotFound: 'Jenis cuti tidak ditemukan',
  leaveTypeRequired: 'leaveTypeId wajib diisi untuk kind LEAVE',
  leaveTypeOnlyForLeave: 'leaveTypeId hanya untuk kind LEAVE',
  attachmentOnlyForLeave: 'Lampiran hanya untuk kind LEAVE',
  destinationRequired: 'Lokasi tujuan wajib diisi untuk dinas luar',
  destinationOnlyForTrip: 'Lokasi tujuan hanya untuk dinas luar',
  invalidRange: 'Tanggal selesai tidak boleh sebelum tanggal mulai',
  noWorkingDays: 'Rentang tanggal tidak berisi hari kerja',
  noWorkingDaysAtReview:
    'Rentang pengajuan tidak lagi berisi hari kerja (cek daftar hari libur). Tolak pengajuan ini.',
  remoteNoticeH1:
    'WFH dan dinas luar diajukan paling lambat H-1: tanggal mulai minimal besok',
  tooFarBack: `Tanggal mulai paling lama ${MAX_BACKDATE_DAYS} hari ke belakang`,
  tooFarAhead: `Tanggal selesai paling jauh ${MAX_ADVANCE_DAYS} hari dari hari ini`,
  crossYear:
    'Cuti tahunan tidak boleh melewati pergantian tahun. Ajukan terpisah per tahun.',
  overlap:
    'Tanggal ini bertumpang tindih dengan pengajuan lain yang menunggu atau disetujui',
  insufficientBalance: 'Saldo cuti tidak cukup',
  invalidAttachmentKey: 'Key lampiran tidak valid',
  attachmentNotUploaded:
    'Lampiran belum diunggah atau link upload sudah kedaluwarsa. Minta link upload baru.',
  invalidAttachmentFile: 'Lampiran harus JPG/PNG/PDF maksimal 2 MB',
  ownRequest: 'Anda tidak dapat memproses pengajuan milik sendiri',
  alreadyProcessed: 'Pengajuan ini sudah diproses dan tidak bisa diubah lagi',
  noAnnualLeaveType: 'Jenis cuti tahunan belum dikonfigurasi',
} as const;

const ATTACHMENT_SUFFIX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const attachmentPrefix = (employeeId: string) => `leave/${employeeId}/`;

/** Object key lampiran baru: leave/<employeeId>/<uuid>. */
export function newAttachmentKey(employeeId: string): string {
  return `${attachmentPrefix(employeeId)}${randomUUID()}`;
}

/** Key lampiran milik karyawan ini (folder sendiri, format newAttachmentKey). */
export function isAttachmentKeyOf(employeeId: string, key: string): boolean {
  const prefix = attachmentPrefix(employeeId);
  return (
    key.startsWith(prefix) && ATTACHMENT_SUFFIX.test(key.slice(prefix.length))
  );
}
