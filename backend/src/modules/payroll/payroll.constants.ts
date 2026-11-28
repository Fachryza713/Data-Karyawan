import type { PayrollPeriodStatus } from '../../generated/prisma/enums.js';

export const PayrollEntities = {
  salaryStructure: 'SalaryStructure',
  benefit: 'Benefit',
  config: 'PayrollConfig',
  period: 'PayrollPeriod',
  item: 'PayrollItem',
} as const;

export const PayrollAuditActions = {
  salaryCreate: 'salary_structure.create',
  benefitCreate: 'benefit.create',
  benefitUpdate: 'benefit.update',
  benefitDelete: 'benefit.delete',
  configUpdate: 'payroll_config.update',
  periodCreate: 'payroll_period.create',
  periodRun: 'payroll_period.run',
  periodFinalize: 'payroll_period.finalize',
  periodMarkPaid: 'payroll_period.mark_paid',
  periodReopen: 'payroll_period.reopen',
  payslipsRegenerate: 'payroll_period.regenerate_payslips',
  itemUpdate: 'payroll_item.update',
} as const;

// ---------------------------------------------------------------------------
// PDF slip (queue "payslip-pdf")
// ---------------------------------------------------------------------------

/** Item mana yang dibuat ulang PDF-nya oleh HR. */
export const RegenerateScope = {
  /** Hanya slip FAILED (default). */
  FAILED: 'FAILED',
  /** Semua slip di periode, termasuk yang sudah READY. */
  ALL: 'ALL',
} as const;

export type RegenerateScope =
  (typeof RegenerateScope)[keyof typeof RegenerateScope];

/** Link PDF untuk karyawan berlaku 5 menit. */
export const PAYSLIP_PDF_URL_TTL_SECONDS = 5 * 60;

/** Saran jeda polling (header Retry-After) saat PDF masih dibuat. */
export const PAYSLIP_PDF_RETRY_AFTER_SECONDS = 5;

/** Sama dengan CHECK payroll_items_slip_error_check. */
export const SLIP_ERROR_MAX_LENGTH = 1000;

/** Halaman slip gaji di portal karyawan (link di email "slip terbit"). */
export const PAYSLIP_APP_PATH = '/app/gaji';

export const PDF_CONTENT_TYPE = 'application/pdf';

/** Object key PDF slip di storage. */
export const payslipObjectKey = (period: string, employeeId: string) =>
  `payslips/${period}/${employeeId}.pdf`;

/** Nama file saat PDF dibuka/diunduh, contoh slip-gaji-2026-11-BRT-2024-0003.pdf. */
export const payslipFileName = (period: string, nip: string) =>
  `slip-gaji-${period}-${nip}.pdf`.replace(/[^A-Za-z0-9._-]/g, '-');

export const PERIOD_STATUS_LABELS: Record<PayrollPeriodStatus, string> = {
  DRAFT: 'draft',
  FINAL: 'final',
  PAID: 'dibayar',
};

export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const NOTE_MAX_LENGTH = 300;
export const REASON_MAX_LENGTH = 500;
export const BANK_NAME_MAX_LENGTH = 100;
export const BENEFIT_TEXT_MAX_LENGTH = 100;
export const BENEFIT_CODE_MAX_LENGTH = 50;
export const MAX_DEPENDENTS = 20;

/** Transaksi run payroll: menunggu advisory lock dan upsert semua karyawan. */
export const RUN_TRANSACTION_TIMEOUT_MS = 60_000;

/** Key advisory lock per periode (pg_advisory_xact_lock). */
export const periodLockKey = (periodId: string) => `payroll-period:${periodId}`;

export const PayrollMessages = {
  employeeNotFound: 'Karyawan tidak ditemukan',
  benefitNotFound: 'Data manfaat tidak ditemukan',
  periodNotFound: 'Periode payroll tidak ditemukan',
  itemNotFound: 'Slip gaji tidak ditemukan',
  payslipNotFound: 'Slip gaji tidak ditemukan atau belum terbit',
  periodExists: 'Payroll untuk periode ini sudah dibuat',
  periodTooFar: 'Payroll paling jauh bisa dibuat untuk bulan depan',
  paidIsFinal: 'Payroll yang sudah dibayar tidak bisa dibuka atau diubah lagi',
  alreadyChanged:
    'Status payroll berubah di antara cek dan update. Muat ulang lalu coba lagi.',
  noEligibleEmployees:
    'Tidak ada karyawan aktif dengan struktur gaji yang berlaku untuk periode ini',
  emptyPeriod: 'Payroll belum berisi slip gaji. Jalankan payroll dulu.',
  negativeNet: 'Potongan melebihi bruto: take home pay tidak boleh negatif',
  negativeNetAtFinalize:
    'Ada slip dengan take home pay negatif. Perbaiki bonus, PPh 21, atau potongan lain dulu.',
  firstOfMonth:
    'effectiveFrom harus tanggal 1: payroll memakai tarif yang berlaku di awal bulan',
  duplicateConfigKey: 'Setiap program hanya boleh muncul sekali',
  configExists:
    'Tarif untuk program dan tanggal berlaku ini sudah ada; tarif lama tidak ditimpa. Pakai effectiveFrom lain.',
  wageCapPositive: 'wageCap harus lebih dari 0, atau null untuk tanpa batas',
  slipPdfQueued: 'Slip PDF sedang dibuat. Coba lagi beberapa saat.',
  slipPdfFailed: 'Slip PDF gagal dibuat. Hubungi HR supaya slip dibuat ulang.',
  slipPdfNotRequested: 'Slip PDF belum dibuat. Hubungi HR.',
  slipsNotPublished:
    'Slip PDF hanya dibuat untuk payroll yang sudah final atau dibayar',
  slipChangedDuringRender:
    'Data slip berubah saat PDF dibuat; dicoba lagi dengan data terbaru',
  slipEnqueueFailed: 'Gagal menambahkan slip ke antrean PDF',
  slipQueueUnavailable:
    'Antrean PDF tidak tersedia. Slip ditandai gagal; coba buat ulang beberapa saat lagi.',
} as const;
