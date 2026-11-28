import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import {
  KpiGrade,
  KpiPeriodStatus,
  KpiReviewStatus,
} from '../../generated/prisma/enums.js';
import {
  KpiMessages,
  MAX_INDICATORS_PER_TEMPLATE,
  PERCENT_PATTERN,
  PERIOD_STATUS_LABELS,
} from './kpi.constants.js';

/**
 * Aturan KPI tanpa I/O (PRD 5.6, 6.5). Bobot, skor, dan nilai akhir selalu
 * Prisma.Decimal; tidak ada perbandingan float. Pelanggaran dilempar
 * sebagai HttpException: 403 diri sendiri, 409 status, 422 aturan bisnis.
 */

const HUNDRED = new Prisma.Decimal(100);

// ---------------------------------------------------------------------------
// Bobot dan template
// ---------------------------------------------------------------------------

/** Teks persen 0-100 (maks 2 desimal) yang sudah lolos DTO menjadi Decimal. */
export function parsePercent(value: string): Prisma.Decimal {
  if (!PERCENT_PATTERN.test(value)) {
    throw new RangeError(`Persen tidak valid: ${value}`);
  }
  return new Prisma.Decimal(value);
}

export function sumWeights(weights: Iterable<Prisma.Decimal>): Prisma.Decimal {
  let total = new Prisma.Decimal(0);
  for (const weight of weights) {
    total = total.plus(weight);
  }
  return total;
}

/**
 * Masalah template, atau null jika valid: minimal satu indikator dan total
 * bobot tepat 100 (Decimal.equals, jadi 33.33 + 33.33 + 33.34 valid dan
 * 33.33 x 3 = 99.99 tidak).
 */
export function templateProblem(
  weights: readonly Prisma.Decimal[],
): string | null {
  if (weights.length === 0) {
    return 'Belum ada indikator';
  }
  const total = sumWeights(weights);
  return total.equals(HUNDRED)
    ? null
    : `Total bobot ${total.toFixed(2)}, harus 100.00`;
}

export function isTemplateValid(weights: readonly Prisma.Decimal[]): boolean {
  return templateProblem(weights) === null;
}

/** 422 jika indikator template sudah mencapai batas. */
export function assertCanAddIndicator(currentCount: number): void {
  if (currentCount >= MAX_INDICATORS_PER_TEMPLATE) {
    throw new UnprocessableEntityException(KpiMessages.tooManyIndicators);
  }
}

/** Nama indikator unik dalam satu template, tanpa membedakan huruf besar/kecil. */
export function hasDuplicateName(names: readonly string[]): boolean {
  const seen = new Set<string>();
  for (const name of names) {
    const key = name.trim().toLocaleLowerCase('id-ID');
    if (seen.has(key)) {
      return true;
    }
    seen.add(key);
  }
  return false;
}

/** Jabatan dengan karyawan aktif dan masalah template-nya (untuk 422 aktivasi). */
export type TemplateGap = {
  positionId: string;
  positionName: string;
  departmentName: string;
  activeEmployees: number;
  templateId: string | null;
  problem: string;
};

export type PositionTemplateState = Omit<TemplateGap, 'problem'> & {
  /** Bobot indikator template aktif; null jika tidak ada template aktif. */
  weights: Prisma.Decimal[] | null;
};

/** Jabatan yang menghalangi aktivasi: tanpa template aktif atau template tidak valid. */
export function findTemplateGaps(
  positions: readonly PositionTemplateState[],
): TemplateGap[] {
  const gaps: TemplateGap[] = [];
  for (const { weights, ...position } of positions) {
    const problem =
      weights === null ? 'Belum ada template aktif' : templateProblem(weights);
    if (problem) {
      gaps.push({ ...position, problem });
    }
  }
  return gaps.sort(
    (a, b) =>
      a.departmentName.localeCompare(b.departmentName, 'id-ID') ||
      a.positionName.localeCompare(b.positionName, 'id-ID'),
  );
}

/** 422 + details.positions jika ada jabatan yang belum siap dinilai. */
export function assertNoTemplateGaps(gaps: readonly TemplateGap[]): void {
  if (gaps.length === 0) {
    return;
  }
  throw new UnprocessableEntityException({
    message: KpiMessages.missingTemplates(
      gaps.length,
      gaps.map((gap) => gap.positionName).join(', '),
    ),
    details: { positions: gaps },
  });
}

// ---------------------------------------------------------------------------
// Nilai akhir dan grade
// ---------------------------------------------------------------------------

export type WeightedScore = {
  score: Prisma.Decimal;
  weight: Prisma.Decimal;
};

/**
 * Nilai akhir = jumlah(skor x bobot / 100), dijumlah tepat lalu dibulatkan
 * sekali ke 1 desimal (ROUND_HALF_UP).
 */
export function computeFinalScore(
  scores: readonly WeightedScore[],
): Prisma.Decimal {
  let total = new Prisma.Decimal(0);
  for (const { score, weight } of scores) {
    total = total.plus(score.times(weight));
  }
  return total
    .dividedBy(HUNDRED)
    .toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP);
}

/** Batas bawah tiap grade, dari yang tertinggi. Di bawah 55 = D. */
export const GRADE_THRESHOLDS: readonly { grade: KpiGrade; min: string }[] = [
  { grade: KpiGrade.A, min: '85' },
  { grade: KpiGrade.B, min: '70' },
  { grade: KpiGrade.C, min: '55' },
];

/** A 85-100, B 70-84, C 55-69, D < 55 (dari nilai akhir yang sudah dibulatkan). */
export function gradeFor(finalScore: Prisma.Decimal): KpiGrade {
  for (const { grade, min } of GRADE_THRESHOLDS) {
    if (finalScore.greaterThanOrEqualTo(min)) {
      return grade;
    }
  }
  return KpiGrade.D;
}

/** Nilai akhir + grade jika semua skor terisi, null jika belum lengkap. */
export function previewResult(
  scores: readonly { score: Prisma.Decimal | null; weight: Prisma.Decimal }[],
): { finalScore: Prisma.Decimal; grade: KpiGrade } | null {
  if (scores.length === 0 || scores.some((item) => item.score === null)) {
    return null;
  }
  const finalScore = computeFinalScore(scores as WeightedScore[]);
  return { finalScore, grade: gradeFor(finalScore) };
}

// ---------------------------------------------------------------------------
// Periode
// ---------------------------------------------------------------------------

/** Tanggal "YYYY-MM-DD": endDate >= startDate dan deadline >= startDate (422). */
export function assertPeriodDates(dates: {
  startDate: string;
  endDate: string;
  deadline: string;
}): void {
  if (dates.endDate < dates.startDate) {
    throw new UnprocessableEntityException(KpiMessages.endBeforeStart);
  }
  if (dates.deadline < dates.startDate) {
    throw new UnprocessableEntityException(KpiMessages.deadlineBeforeStart);
  }
}

/** DRAFT: semua field. ACTIVE: hanya deadline. CLOSED: tidak bisa (409). */
export function assertPeriodEditable(
  status: KpiPeriodStatus,
  fields: readonly string[],
): void {
  if (status === KpiPeriodStatus.CLOSED) {
    throw new ConflictException(KpiMessages.closedLocked);
  }
  if (
    status === KpiPeriodStatus.ACTIVE &&
    fields.some((field) => field !== 'deadline')
  ) {
    throw new ConflictException(KpiMessages.activeOnlyDeadline);
  }
}

/** DRAFT -> ACTIVE (aktivasi), ACTIVE -> CLOSED (tutup). */
export const PERIOD_TRANSITIONS: Record<
  KpiPeriodStatus,
  readonly KpiPeriodStatus[]
> = {
  DRAFT: [KpiPeriodStatus.ACTIVE],
  ACTIVE: [KpiPeriodStatus.CLOSED],
  CLOSED: [],
};

export function assertPeriodTransition(
  from: KpiPeriodStatus,
  to: KpiPeriodStatus,
): void {
  if (!PERIOD_TRANSITIONS[from].includes(to)) {
    throw new ConflictException(
      `Periode berstatus ${PERIOD_STATUS_LABELS[from]} tidak bisa diubah menjadi ${PERIOD_STATUS_LABELS[to]}`,
    );
  }
}

/** Jumlah hari dari `today` ke `deadline` (keduanya "YYYY-MM-DD"); negatif = lewat. */
export function daysUntil(today: string, deadline: string): number {
  const ms =
    Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

// ---------------------------------------------------------------------------
// Penilaian
// ---------------------------------------------------------------------------

export type LockedReview = {
  status: KpiReviewStatus;
  periodStatus: KpiPeriodStatus;
  periodName: string;
  employeeUserId: string;
};

/**
 * Skor hanya bisa diisi/difinalkan untuk review DRAFT di periode ACTIVE,
 * dan tidak oleh HR yang dinilai (403, sama seperti approval cuti).
 */
export function assertReviewScorable(
  review: LockedReview,
  actorUserId: string,
): void {
  if (review.employeeUserId === actorUserId) {
    throw new ForbiddenException(KpiMessages.ownReview);
  }
  if (review.status === KpiReviewStatus.FINAL) {
    throw new ConflictException(KpiMessages.reviewFinal);
  }
  if (review.periodStatus !== KpiPeriodStatus.ACTIVE) {
    throw new ConflictException(KpiMessages.periodNotActive(review.periodName));
  }
}

/**
 * Skor yang dikirim harus tepat satu per indikator review: tidak ada yang
 * terlewat, asing, atau ganda (422 dengan rinciannya).
 */
export function assertCompleteScoreSet(
  indicators: readonly { indicatorId: string; name: string }[],
  submitted: readonly { indicatorId: string }[],
): void {
  const expected = new Map(indicators.map((i) => [i.indicatorId, i.name]));
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  const unknown: string[] = [];
  for (const { indicatorId } of submitted) {
    if (!expected.has(indicatorId)) {
      unknown.push(indicatorId);
    } else if (seen.has(indicatorId)) {
      duplicate.add(indicatorId);
    }
    seen.add(indicatorId);
  }
  const missing = indicators
    .filter((indicator) => !seen.has(indicator.indicatorId))
    .map((indicator) => indicator.name);
  if (missing.length || unknown.length || duplicate.size) {
    throw new UnprocessableEntityException({
      message: KpiMessages.scoresMismatch,
      details: { missing, unknown, duplicate: [...duplicate] },
    });
  }
}

/** Finalisasi butuh semua skor terisi (422). */
export function assertAllScored(
  scores: readonly { score: Prisma.Decimal | null }[],
): void {
  const filled = scores.filter((item) => item.score !== null).length;
  if (scores.length === 0 || filled < scores.length) {
    throw new UnprocessableEntityException(
      KpiMessages.scoresIncomplete(filled, scores.length),
    );
  }
}
