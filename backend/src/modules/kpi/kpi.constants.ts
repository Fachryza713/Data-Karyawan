import type {
  KpiPeriodStatus,
  KpiReviewStatus,
} from '../../generated/prisma/enums.js';

/** Batas teks, sama dengan CHECK constraint migrasi `kpi`. */
export const KPI_NAME_MAX_LENGTH = 120;
export const KPI_DESCRIPTION_MAX_LENGTH = 500;
export const KPI_TARGET_MAX_LENGTH = 120;
export const KPI_PERIOD_NAME_MAX_LENGTH = 50;
export const KPI_REVIEW_NOTE_MAX_LENGTH = 1000;
export const KPI_SCORE_NOTE_MAX_LENGTH = 500;

/** Indikator per template (sama dengan versi Supabase). */
export const MAX_INDICATORS_PER_TEMPLATE = 20;
export const MAX_INDICATOR_ORDER = 999;

/**
 * Bobot dan skor sebagai teks desimal 0-100, maksimal 2 desimal
 * ("33.33", "87.5", "100"). Bobot juga harus > 0 (dicek terpisah).
 */
export const PERCENT_PATTERN = /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/;

/** Aktivasi periode membuat penilaian untuk semua karyawan aktif. */
export const KPI_ACTIVATION_TIMEOUT_MS = 60_000;

export const KpiEntities = {
  template: 'KpiTemplate',
  indicator: 'KpiIndicator',
  period: 'KpiPeriod',
  review: 'KpiReview',
} as const;

export const KpiAuditActions = {
  templateCreate: 'kpi_template.create',
  templateUpdate: 'kpi_template.update',
  templateCopy: 'kpi_template.copy',
  indicatorCreate: 'kpi_indicator.create',
  indicatorUpdate: 'kpi_indicator.update',
  indicatorDelete: 'kpi_indicator.delete',
  periodCreate: 'kpi_period.create',
  periodUpdate: 'kpi_period.update',
  periodActivate: 'kpi_period.activate',
  periodClose: 'kpi_period.close',
  reviewFinalize: 'kpi_review.finalize',
} as const;

export const PERIOD_STATUS_LABELS: Record<KpiPeriodStatus, string> = {
  DRAFT: 'draft',
  ACTIVE: 'aktif',
  CLOSED: 'ditutup',
};

export const REVIEW_STATUS_LABELS: Record<KpiReviewStatus, string> = {
  DRAFT: 'draft',
  FINAL: 'final',
};

export const KpiMessages = {
  positionNotFound: 'Jabatan tidak ditemukan',
  templateNotFound: 'Template KPI tidak ditemukan',
  indicatorNotFound: 'Indikator tidak ditemukan di template ini',
  periodNotFound: 'Periode KPI tidak ditemukan',
  reviewNotFound: 'Penilaian KPI tidak ditemukan',
  activeTemplateConflict:
    'Jabatan ini baru saja mendapat template aktif lain. Muat ulang lalu coba lagi.',
  tooManyIndicators: `Template maksimal ${MAX_INDICATORS_PER_TEMPLATE} indikator`,
  duplicateIndicatorName: 'Nama indikator sudah dipakai di template ini',
  weightPositive: 'Bobot harus lebih dari 0',
  copySamePosition: 'Jabatan sumber dan tujuan harus berbeda',
  copyNoSource: 'Jabatan sumber belum punya template aktif untuk disalin',
  periodNameExists: 'Nama periode KPI sudah dipakai',
  endBeforeStart: 'endDate tidak boleh sebelum startDate',
  deadlineBeforeStart: 'deadline tidak boleh sebelum startDate',
  otherPeriodActive: (name: string) =>
    `Periode ${name} masih aktif. Tutup periode itu terlebih dahulu.`,
  activeConflict:
    'Ada periode lain yang baru saja diaktifkan. Muat ulang lalu coba lagi.',
  noActiveEmployees: 'Tidak ada karyawan aktif untuk dinilai di periode ini',
  missingTemplates: (count: number, names: string) =>
    `Periode belum bisa diaktifkan: ${count} jabatan dengan karyawan aktif belum punya template KPI valid (total bobot 100): ${names}`,
  activeOnlyDeadline: 'Periode aktif hanya bisa diubah tenggatnya (deadline)',
  closedLocked: 'Periode yang sudah ditutup tidak bisa diubah',
  alreadyChanged:
    'Status berubah di antara cek dan update. Muat ulang lalu coba lagi.',
  reviewFinal: 'Penilaian sudah final. Skor tidak bisa diubah.',
  periodNotActive: (name: string) =>
    `Periode ${name} tidak aktif. Penilaian hanya bisa diisi selama periode aktif.`,
  ownReview: 'Anda tidak dapat menilai KPI Anda sendiri',
  scoresMismatch:
    'Skor harus diisi tepat satu kali untuk setiap indikator penilaian ini',
  scoresIncomplete: (filled: number, total: number) =>
    `Semua indikator wajib diberi skor sebelum finalisasi (${filled} dari ${total} terisi)`,
} as const;
