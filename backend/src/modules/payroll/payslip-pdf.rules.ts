import { ConflictException } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import {
  PayrollPeriodStatus,
  SlipStatus,
} from '../../generated/prisma/enums.js';
import { PayrollMessages, SLIP_ERROR_MAX_LENGTH } from './payroll.constants.js';

/**
 * Aturan PDF slip tanpa I/O: kapan slip boleh dibuat, kapan job dianggap
 * gagal permanen, dan apa yang dilihat karyawan untuk tiap SlipStatus.
 */

/** Slip terbit (terlihat karyawan) hanya setelah FINAL (PRD US-13). */
export const PUBLISHED_PERIOD_STATUSES: readonly PayrollPeriodStatus[] = [
  PayrollPeriodStatus.FINAL,
  PayrollPeriodStatus.PAID,
];

export function isPublishedPeriod(status: PayrollPeriodStatus): boolean {
  return PUBLISHED_PERIOD_STATUSES.includes(status);
}

/** Buat ulang PDF hanya untuk periode terbit; DRAFT belum punya slip final (409). */
export function assertSlipsPublished(status: PayrollPeriodStatus): void {
  if (!isPublishedPeriod(status)) {
    throw new ConflictException(PayrollMessages.slipsNotPublished);
  }
}

/**
 * Email "slip terbit" dikirim sekali per penerbitan: saat finalize, dan saat
 * HR membuat ulang slip yang belum pernah READY. Slip READY yang dibuat
 * ulang (scope ALL) diganti diam-diam.
 */
export function shouldNotifyOnRegenerate(previous: SlipStatus): boolean {
  return previous !== SlipStatus.READY;
}

/** Bagian job BullMQ yang menentukan sisa percobaan. */
export type JobAttempts = {
  attemptsMade: number;
  opts: { attempts?: number };
};

/**
 * Percobaan yang sedang berjalan adalah yang terakhir: BullMQ tidak akan
 * mencoba lagi jika percobaan ini gagal (rumus yang sama dengan
 * Job.shouldRetryJob). attemptsMade = jumlah percobaan yang sudah gagal.
 */
export function isFinalAttempt(job: JobAttempts, error: unknown): boolean {
  if (error instanceof UnrecoverableError) {
    return true;
  }
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}

/** Pesan error untuk slipError, dipotong ke batas kolom. */
export function toSlipError(error: unknown, prefix?: string): string {
  const reason =
    error instanceof Error ? error.message || error.name : String(error);
  const text = prefix ? `${prefix}: ${reason}` : reason;
  return text.length > SLIP_ERROR_MAX_LENGTH
    ? `${text.slice(0, SLIP_ERROR_MAX_LENGTH - 3)}...`
    : text;
}

export type PayslipPdfAvailability =
  | { status: typeof SlipStatus.READY; key: string }
  | { status: typeof SlipStatus.QUEUED };

/**
 * Yang didapat karyawan untuk slip terbit: READY = link PDF, QUEUED = masih
 * dibuat (202). FAILED dan NONE tidak akan selesai sendiri, jadi 409 dengan
 * arahan ke HR (bukan 202 yang membuat klien menunggu terus).
 */
export function payslipPdfAvailability(
  slipStatus: SlipStatus,
  slipKey: string | null,
): PayslipPdfAvailability {
  switch (slipStatus) {
    case SlipStatus.READY:
      if (slipKey) {
        return { status: SlipStatus.READY, key: slipKey };
      }
      // CHECK payroll_items_slip_ready_check menjamin key ada saat READY.
      throw new Error('Slip READY tanpa slipKey');
    case SlipStatus.QUEUED:
      return { status: SlipStatus.QUEUED };
    case SlipStatus.FAILED:
      throw new ConflictException(PayrollMessages.slipPdfFailed);
    case SlipStatus.NONE:
      throw new ConflictException(PayrollMessages.slipPdfNotRequested);
  }
}
