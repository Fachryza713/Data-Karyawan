import { toDateOnly } from '../../common/validation/date-only.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  KpiIndicatorResponseDto,
  KpiPeriodResponseDto,
  KpiReviewDetailDto,
  KpiReviewSummaryDto,
  KpiTemplateResponseDto,
} from './dto/kpi-response.dto.js';
import { previewResult, sumWeights, templateProblem } from './kpi-rules.js';

export const KPI_INDICATOR_SELECT = {
  id: true,
  name: true,
  description: true,
  weight: true,
  target: true,
  order: true,
} as const satisfies Prisma.KpiIndicatorSelect;

export const KPI_TEMPLATE_SELECT = {
  id: true,
  positionId: true,
  name: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  position: {
    select: {
      id: true,
      name: true,
      department: { select: { id: true, name: true } },
    },
  },
  indicators: {
    select: KPI_INDICATOR_SELECT,
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  },
} as const satisfies Prisma.KpiTemplateSelect;

export type KpiTemplateRow = Prisma.KpiTemplateGetPayload<{
  select: typeof KPI_TEMPLATE_SELECT;
}>;

export const KPI_PERIOD_SELECT = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  deadline: true,
  status: true,
  activatedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { reviews: true } },
} as const satisfies Prisma.KpiPeriodSelect;

export type KpiPeriodRow = Prisma.KpiPeriodGetPayload<{
  select: typeof KPI_PERIOD_SELECT;
}>;

const REF = { select: { id: true, name: true } } as const;

export const KPI_REVIEW_SUMMARY_SELECT = {
  id: true,
  status: true,
  finalScore: true,
  grade: true,
  finalizedAt: true,
  updatedAt: true,
  period: REF,
  employee: { select: { id: true, nip: true, fullName: true } },
  position: REF,
  department: REF,
  reviewer: {
    select: { id: true, email: true, employee: { select: { fullName: true } } },
  },
  scores: { select: { score: true } },
} as const satisfies Prisma.KpiReviewSelect;

export type KpiReviewSummaryRow = Prisma.KpiReviewGetPayload<{
  select: typeof KPI_REVIEW_SUMMARY_SELECT;
}>;

export const KPI_REVIEW_DETAIL_SELECT = {
  ...KPI_REVIEW_SUMMARY_SELECT,
  note: true,
  template: REF,
  scores: {
    select: {
      indicatorId: true,
      name: true,
      description: true,
      weight: true,
      target: true,
      order: true,
      score: true,
      note: true,
    },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
  },
} as const satisfies Prisma.KpiReviewSelect;

export type KpiReviewDetailRow = Prisma.KpiReviewGetPayload<{
  select: typeof KPI_REVIEW_DETAIL_SELECT;
}>;

/** Nilai akhir 1 desimal sebagai teks, contoh "82.4". */
export const formatFinalScore = (value: Prisma.Decimal) => value.toFixed(1);

export function toIndicatorDto(
  row: Prisma.KpiIndicatorGetPayload<{ select: typeof KPI_INDICATOR_SELECT }>,
): KpiIndicatorResponseDto {
  return { ...row, weight: row.weight.toFixed(2) };
}

export function toTemplateDto(row: KpiTemplateRow): KpiTemplateResponseDto {
  const weights = row.indicators.map((indicator) => indicator.weight);
  const problem = templateProblem(weights);
  return {
    id: row.id,
    position: { id: row.position.id, name: row.position.name },
    department: row.position.department,
    name: row.name,
    isActive: row.isActive,
    indicators: row.indicators.map(toIndicatorDto),
    totalWeight: sumWeights(weights).toFixed(2),
    isValid: problem === null,
    problem,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Isi template untuk AuditLog (bobot sebagai teks). */
export function templateSnapshot(row: KpiTemplateRow) {
  const dto = toTemplateDto(row);
  return {
    positionId: row.positionId,
    name: dto.name,
    isActive: dto.isActive,
    totalWeight: dto.totalWeight,
    indicators: dto.indicators.map(({ name, weight, order }) => ({
      name,
      weight,
      order,
    })),
  };
}

export function toPeriodDto(row: KpiPeriodRow): KpiPeriodResponseDto {
  return {
    id: row.id,
    name: row.name,
    startDate: toDateOnly(row.startDate),
    endDate: toDateOnly(row.endDate),
    deadline: toDateOnly(row.deadline),
    status: row.status,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    reviewCount: row._count.reviews,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toReviewSummaryDto(
  row: KpiReviewSummaryRow | KpiReviewDetailRow,
): KpiReviewSummaryDto {
  return {
    id: row.id,
    period: row.period,
    employee: row.employee,
    position: row.position,
    department: row.department,
    reviewer: row.reviewer
      ? {
          id: row.reviewer.id,
          name: row.reviewer.employee?.fullName ?? row.reviewer.email,
        }
      : null,
    status: row.status,
    finalScore: row.finalScore ? formatFinalScore(row.finalScore) : null,
    grade: row.grade,
    scoredCount: row.scores.filter((score) => score.score !== null).length,
    indicatorCount: row.scores.length,
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toReviewDetailDto(row: KpiReviewDetailRow): KpiReviewDetailDto {
  const preview = previewResult(row.scores);
  return {
    ...toReviewSummaryDto(row),
    note: row.note,
    template: row.template,
    scores: row.scores.map((score) => ({
      ...score,
      weight: score.weight.toFixed(2),
      score: score.score?.toFixed(2) ?? null,
    })),
    preview: preview
      ? {
          finalScore: formatFinalScore(preview.finalScore),
          grade: preview.grade,
        }
      : null,
  };
}
