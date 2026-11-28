import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../common/auth/auth-user.js';
import {
  buildPageMeta,
  pageToSkipTake,
} from '../../common/dto/pagination.dto.js';
import { Clock } from '../../common/time/clock.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { KpiReviewStatus } from '../../generated/prisma/enums.js';
import {
  type AppTransactionClient,
  PrismaService,
} from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  ListKpiReviewsQueryDto,
  SaveKpiScoresDto,
} from './dto/kpi-request.dto.js';
import type {
  KpiReviewDetailDto,
  KpiReviewListResponseDto,
} from './dto/kpi-response.dto.js';
import {
  assertAllScored,
  assertCompleteScoreSet,
  assertReviewScorable,
  computeFinalScore,
  gradeFor,
  type LockedReview,
  parsePercent,
  type WeightedScore,
} from './kpi-rules.js';
import { KpiEntities, KpiMessages } from './kpi.constants.js';
import {
  formatFinalScore,
  KPI_REVIEW_DETAIL_SELECT,
  KPI_REVIEW_SUMMARY_SELECT,
  toReviewDetailDto,
  toReviewSummaryDto,
} from './kpi.mapper.js';

type LockedRow = LockedReview & { periodId: string; employeeId: string };

/**
 * Kunci baris review (FOR UPDATE) dan periodenya (FOR SHARE) sampai
 * transaksi selesai: simpan skor dan finalisasi berjalan berurutan, dan
 * periode tidak bisa ditutup di tengahnya.
 */
async function lockReview(
  tx: AppTransactionClient,
  reviewId: string,
): Promise<LockedRow | null> {
  const rows = await tx.$queryRaw<LockedRow[]>`
    SELECT r.status::text AS "status",
           r.period_id AS "periodId",
           r.employee_id AS "employeeId",
           p.status::text AS "periodStatus",
           p.name AS "periodName",
           e.user_id AS "employeeUserId"
    FROM kpi_reviews r
    JOIN kpi_periods p ON p.id = r.period_id
    JOIN employees e ON e.id = r.employee_id
    WHERE r.id = ${reviewId}::uuid
    FOR UPDATE OF r FOR SHARE OF p`;
  return rows[0] ?? null;
}

/**
 * Penilaian KPI oleh HR. Skor hanya bisa diisi untuk review DRAFT di
 * periode ACTIVE, satu skor per indikator snapshot. Finalisasi menghitung
 * nilai akhir dan grade; setelah FINAL skor terkunci.
 */
@Injectable()
export class KpiReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async list(query: ListKpiReviewsQueryDto): Promise<KpiReviewListResponseDto> {
    const where: Prisma.KpiReviewWhereInput = {
      ...(query.periodId ? { periodId: query.periodId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.client.kpiReview.findMany({
        where,
        orderBy: [
          { period: { startDate: 'desc' } },
          { employee: { fullName: 'asc' } },
          { id: 'asc' },
        ],
        ...pageToSkipTake(query.page, query.limit),
        select: KPI_REVIEW_SUMMARY_SELECT,
      }),
      this.prisma.client.kpiReview.count({ where }),
    ]);
    return {
      data: rows.map(toReviewSummaryDto),
      meta: buildPageMeta(query.page, query.limit, total),
    };
  }

  async findOne(id: string): Promise<KpiReviewDetailDto> {
    const row = await this.prisma.client.kpiReview.findUnique({
      where: { id },
      select: KPI_REVIEW_DETAIL_SELECT,
    });
    if (!row) {
      throw new NotFoundException(KpiMessages.reviewNotFound);
    }
    return toReviewDetailDto(row);
  }

  /** Timpa semua skor dan catatan review DRAFT. HR yang menyimpan menjadi reviewer. */
  async saveScores(
    id: string,
    dto: SaveKpiScoresDto,
    actor: AuthUser,
  ): Promise<KpiReviewDetailDto> {
    const values = dto.scores.map((item) => ({
      indicatorId: item.indicatorId,
      score: parsePercent(item.score),
      note: item.note ?? null,
    }));
    await this.prisma.client.$transaction(async (tx) => {
      await this.lockScorable(tx, id, actor);
      const indicators = await tx.kpiScore.findMany({
        where: { reviewId: id },
        select: { indicatorId: true, name: true },
      });
      assertCompleteScoreSet(indicators, values);
      for (const value of values) {
        await tx.kpiScore.update({
          where: {
            reviewId_indicatorId: {
              reviewId: id,
              indicatorId: value.indicatorId,
            },
          },
          data: { score: value.score, note: value.note },
        });
      }
      await tx.kpiReview.update({
        where: { id },
        data: { note: dto.note ?? null, reviewerId: actor.id },
      });
    });
    return this.findOne(id);
  }

  /**
   * DRAFT -> FINAL: nilai akhir = jumlah(skor x bobot / 100) dibulatkan
   * 1 desimal, grade dari nilai itu. Butuh semua skor terisi.
   */
  async finalize(id: string, actor: AuthUser): Promise<KpiReviewDetailDto> {
    await this.prisma.client.$transaction(async (tx) => {
      const review = await this.lockScorable(tx, id, actor);
      const scores = await tx.kpiScore.findMany({
        where: { reviewId: id },
        select: { score: true, weight: true },
      });
      assertAllScored(scores);
      const finalScore = computeFinalScore(scores as WeightedScore[]);
      const grade = gradeFor(finalScore);
      const finalizedAt = this.clock.now();
      await tx.kpiReview.update({
        where: { id },
        data: {
          status: KpiReviewStatus.FINAL,
          finalScore,
          grade,
          finalizedAt,
          reviewerId: actor.id,
        },
      });
      await this.audit.recordChange(
        {
          entity: KpiEntities.review,
          entityId: id,
          before: {
            periodId: review.periodId,
            employeeId: review.employeeId,
            status: KpiReviewStatus.DRAFT,
          },
          after: {
            periodId: review.periodId,
            employeeId: review.employeeId,
            status: KpiReviewStatus.FINAL,
            finalScore: formatFinalScore(finalScore),
            grade,
            finalizedAt,
          },
        },
        tx,
      );
    });
    return this.findOne(id);
  }

  private async lockScorable(
    tx: AppTransactionClient,
    id: string,
    actor: AuthUser,
  ): Promise<LockedRow> {
    const review = await lockReview(tx, id);
    if (!review) {
      throw new NotFoundException(KpiMessages.reviewNotFound);
    }
    assertReviewScorable(review, actor.id);
    return review;
  }
}
