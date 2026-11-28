import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Clock } from '../../common/time/clock.js';
import {
  parseDateOnly,
  toDateOnly,
  toWibDateOnly,
} from '../../common/validation/date-only.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  KpiPeriodStatus,
  KpiReviewStatus,
} from '../../generated/prisma/enums.js';
import { isPrismaError } from '../../prisma/prisma-errors.js';
import {
  type AppTransactionClient,
  PrismaService,
} from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  CreateKpiPeriodDto,
  ListKpiPeriodsQueryDto,
  UpdateKpiPeriodDto,
} from './dto/kpi-request.dto.js';
import type {
  KpiActivationResponseDto,
  KpiPeriodProgressDto,
  KpiPeriodResponseDto,
} from './dto/kpi-response.dto.js';
import {
  assertNoTemplateGaps,
  assertPeriodDates,
  assertPeriodEditable,
  assertPeriodTransition,
  daysUntil,
  findTemplateGaps,
  type PositionTemplateState,
} from './kpi-rules.js';
import {
  KPI_ACTIVATION_TIMEOUT_MS,
  KpiEntities,
  KpiMessages,
} from './kpi.constants.js';
import {
  formatFinalScore,
  KPI_PERIOD_SELECT,
  type KpiPeriodRow,
  toPeriodDto,
} from './kpi.mapper.js';

const periodSnapshot = (row: KpiPeriodRow) => {
  const {
    reviewCount: _count,
    createdAt: _c,
    updatedAt: _u,
    ...rest
  } = toPeriodDto(row);
  return rest;
};

/**
 * Periode KPI: DRAFT -> ACTIVE -> CLOSED. Hanya satu periode ACTIVE (index
 * unik parsial kpi_periods_one_active). Aktivasi, dalam satu transaksi:
 * cek semua jabatan yang punya karyawan aktif sudah punya template valid
 * (422 + daftar jabatan jika belum), ubah status, lalu buat KpiReview
 * DRAFT per karyawan aktif dengan snapshot indikator dan bobot di KpiScore.
 */
@Injectable()
export class KpiPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async list(query: ListKpiPeriodsQueryDto): Promise<KpiPeriodResponseDto[]> {
    const rows = await this.prisma.client.kpiPeriod.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: [{ startDate: 'desc' }, { name: 'asc' }],
      select: KPI_PERIOD_SELECT,
    });
    return rows.map(toPeriodDto);
  }

  async findOne(id: string): Promise<KpiPeriodResponseDto> {
    return toPeriodDto(await this.findPeriod(this.prisma.client, id));
  }

  async create(dto: CreateKpiPeriodDto): Promise<KpiPeriodResponseDto> {
    assertPeriodDates(dto);
    return this.withNameConflict(() =>
      this.prisma.client.$transaction(async (tx) => {
        const created = await tx.kpiPeriod.create({
          data: {
            name: dto.name,
            startDate: parseDateOnly(dto.startDate),
            endDate: parseDateOnly(dto.endDate),
            deadline: parseDateOnly(dto.deadline),
          },
          select: KPI_PERIOD_SELECT,
        });
        await this.audit.recordChange(
          {
            entity: KpiEntities.period,
            entityId: created.id,
            after: periodSnapshot(created),
          },
          tx,
        );
        return toPeriodDto(created);
      }),
    );
  }

  /** DRAFT: semua field. ACTIVE: hanya deadline. CLOSED: 409. */
  async update(
    id: string,
    dto: UpdateKpiPeriodDto,
  ): Promise<KpiPeriodResponseDto> {
    const fields = Object.entries(dto)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    return this.withNameConflict(() =>
      this.prisma.client.$transaction(async (tx) => {
        const current = await this.findPeriod(tx, id);
        assertPeriodEditable(current.status, fields);
        const dates = {
          startDate: dto.startDate ?? toDateOnly(current.startDate),
          endDate: dto.endDate ?? toDateOnly(current.endDate),
          deadline: dto.deadline ?? toDateOnly(current.deadline),
        };
        assertPeriodDates(dates);
        const { count } = await tx.kpiPeriod.updateMany({
          where: { id, status: current.status },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            startDate: parseDateOnly(dates.startDate),
            endDate: parseDateOnly(dates.endDate),
            deadline: parseDateOnly(dates.deadline),
          },
        });
        if (count === 0) {
          throw new ConflictException(KpiMessages.alreadyChanged);
        }
        const updated = await this.findPeriod(tx, id);
        await this.audit.recordChange(
          {
            entity: KpiEntities.period,
            entityId: id,
            before: periodSnapshot(current),
            after: periodSnapshot(updated),
          },
          tx,
        );
        return toPeriodDto(updated);
      }),
    );
  }

  async activate(id: string): Promise<KpiActivationResponseDto> {
    try {
      return await this.prisma.client.$transaction(
        (tx) => this.activateInTx(tx, id),
        { timeout: KPI_ACTIVATION_TIMEOUT_MS },
      );
    } catch (error) {
      // Index unik parsial: periode lain diaktifkan bersamaan.
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(KpiMessages.activeConflict);
      }
      throw error;
    }
  }

  /** ACTIVE -> CLOSED. Penilaian DRAFT yang tersisa ikut terkunci. */
  async close(id: string): Promise<KpiPeriodResponseDto> {
    return this.prisma.client.$transaction(async (tx) => {
      const current = await this.findPeriod(tx, id);
      assertPeriodTransition(current.status, KpiPeriodStatus.CLOSED);
      const { count } = await tx.kpiPeriod.updateMany({
        where: { id, status: KpiPeriodStatus.ACTIVE },
        data: { status: KpiPeriodStatus.CLOSED, closedAt: this.clock.now() },
      });
      if (count === 0) {
        throw new ConflictException(KpiMessages.alreadyChanged);
      }
      const closed = await this.findPeriod(tx, id);
      const draftLeft = await tx.kpiReview.count({
        where: { periodId: id, status: KpiReviewStatus.DRAFT },
      });
      await this.audit.recordChange(
        {
          entity: KpiEntities.period,
          entityId: id,
          before: periodSnapshot(current),
          after: { ...periodSnapshot(closed), draftReviewsLeft: draftLeft },
        },
        tx,
      );
      return toPeriodDto(closed);
    });
  }

  /** Dinilai (FINAL) / total, rata-rata nilai akhir FINAL, dan tenggat (WIB). */
  async progress(id: string): Promise<KpiPeriodProgressDto> {
    const period = await this.findPeriod(this.prisma.client, id);
    const [groups, average] = await Promise.all([
      this.prisma.client.kpiReview.groupBy({
        by: ['status'],
        where: { periodId: id },
        _count: { _all: true },
      }),
      this.prisma.client.kpiReview.aggregate({
        where: { periodId: id, status: KpiReviewStatus.FINAL },
        _avg: { finalScore: true },
      }),
    ]);
    const count = (status: KpiReviewStatus) =>
      groups.find((group) => group.status === status)?._count._all ?? 0;
    const finalized = count(KpiReviewStatus.FINAL);
    const total = finalized + count(KpiReviewStatus.DRAFT);
    const deadline = toDateOnly(period.deadline);
    const daysToDeadline = daysUntil(toWibDateOnly(this.clock.now()), deadline);
    const avg = average._avg.finalScore;
    return {
      periodId: period.id,
      name: period.name,
      status: period.status,
      deadline,
      daysToDeadline,
      isOverdue:
        period.status === KpiPeriodStatus.ACTIVE &&
        daysToDeadline < 0 &&
        finalized < total,
      total,
      finalized,
      remaining: total - finalized,
      percentFinalized: total === 0 ? 0 : Math.floor((finalized * 100) / total),
      averageScore: avg
        ? formatFinalScore(avg.toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP))
        : null,
    };
  }

  private async activateInTx(
    tx: AppTransactionClient,
    id: string,
  ): Promise<KpiActivationResponseDto> {
    const period = await this.findPeriod(tx, id);
    assertPeriodTransition(period.status, KpiPeriodStatus.ACTIVE);
    const active = await tx.kpiPeriod.findFirst({
      where: { status: KpiPeriodStatus.ACTIVE, id: { not: id } },
      select: { name: true },
    });
    if (active) {
      throw new ConflictException(KpiMessages.otherPeriodActive(active.name));
    }

    // Karyawan aktif: belum dihapus (extension), akun aktif, sudah bergabung
    // sebelum periode berakhir.
    const employees = await tx.employee.findMany({
      where: { user: { isActive: true }, joinDate: { lte: period.endDate } },
      select: {
        id: true,
        positionId: true,
        departmentId: true,
        position: {
          select: { name: true, department: { select: { name: true } } },
        },
      },
    });
    if (employees.length === 0) {
      throw new UnprocessableEntityException(KpiMessages.noActiveEmployees);
    }
    const positionIds = [...new Set(employees.map((e) => e.positionId))];
    const templates = await tx.kpiTemplate.findMany({
      where: { isActive: true, positionId: { in: positionIds } },
      select: {
        id: true,
        positionId: true,
        indicators: {
          select: {
            id: true,
            name: true,
            description: true,
            weight: true,
            target: true,
            order: true,
          },
        },
      },
    });
    const templateByPosition = new Map(templates.map((t) => [t.positionId, t]));

    const states = new Map<string, PositionTemplateState>();
    for (const employee of employees) {
      const state = states.get(employee.positionId);
      if (state) {
        state.activeEmployees += 1;
        continue;
      }
      const template = templateByPosition.get(employee.positionId);
      states.set(employee.positionId, {
        positionId: employee.positionId,
        positionName: employee.position.name,
        departmentName: employee.position.department.name,
        activeEmployees: 1,
        templateId: template?.id ?? null,
        weights: template ? template.indicators.map((i) => i.weight) : null,
      });
    }
    assertNoTemplateGaps(findTemplateGaps([...states.values()]));

    const activatedAt = this.clock.now();
    const { count } = await tx.kpiPeriod.updateMany({
      where: { id, status: KpiPeriodStatus.DRAFT },
      data: { status: KpiPeriodStatus.ACTIVE, activatedAt },
    });
    if (count === 0) {
      throw new ConflictException(KpiMessages.alreadyChanged);
    }

    const reviews = await tx.kpiReview.createManyAndReturn({
      data: employees.map((employee) => ({
        periodId: id,
        employeeId: employee.id,
        positionId: employee.positionId,
        departmentId: employee.departmentId,
        templateId: templateByPosition.get(employee.positionId)?.id ?? null,
      })),
      select: { id: true, positionId: true },
    });
    const scores: Prisma.KpiScoreCreateManyInput[] = reviews.flatMap((review) =>
      (templateByPosition.get(review.positionId ?? '')?.indicators ?? []).map(
        ({ id: indicatorId, ...indicator }) => ({
          reviewId: review.id,
          indicatorId,
          ...indicator,
        }),
      ),
    );
    await tx.kpiScore.createMany({ data: scores });

    const activated = await this.findPeriod(tx, id);
    await this.audit.recordChange(
      {
        entity: KpiEntities.period,
        entityId: id,
        before: periodSnapshot(period),
        after: {
          ...periodSnapshot(activated),
          reviewsCreated: reviews.length,
          templates: Object.fromEntries(
            [...states.values()].map((state) => [
              state.positionId,
              state.templateId,
            ]),
          ),
        },
      },
      tx,
    );
    return { period: toPeriodDto(activated), reviewsCreated: reviews.length };
  }

  private async withNameConflict<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(KpiMessages.periodNameExists);
      }
      throw error;
    }
  }

  private async findPeriod(
    db: AppTransactionClient | PrismaService['client'],
    id: string,
  ): Promise<KpiPeriodRow> {
    const row = await db.kpiPeriod.findUnique({
      where: { id },
      select: KPI_PERIOD_SELECT,
    });
    if (!row) {
      throw new NotFoundException(KpiMessages.periodNotFound);
    }
    return row;
  }
}
