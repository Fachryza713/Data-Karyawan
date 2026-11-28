import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { zeroMoney } from '../../common/money/money.js';
import { Clock } from '../../common/time/clock.js';
import { toWibDateOnly } from '../../common/validation/date-only.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PayrollPeriodStatus } from '../../generated/prisma/enums.js';
import { isPrismaError } from '../../prisma/prisma-errors.js';
import {
  type AppTransactionClient,
  PrismaService,
} from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  CreatePayrollPeriodDto,
  ListPayrollPeriodsQueryDto,
} from './dto/payroll-request.dto.js';
import type {
  EmployerContributionReportDto,
  PayrollPeriodDetailResponseDto,
  PayrollPeriodResponseDto,
} from './dto/payroll-response.dto.js';
import { lockPayrollPeriod } from './payroll-lock.js';
import {
  assertFinalizable,
  assertPeriodCreatable,
  assertPeriodTransition,
} from './payroll-rules.js';
import {
  parseEmployerContributions,
  sumItems,
  toEmployerContributionsJson,
  toTotalsJson,
} from './payroll-totals.js';
import {
  PayrollEntities,
  PayrollMessages,
  PERIOD_STATUS_LABELS,
} from './payroll.constants.js';
import {
  PAYROLL_ITEM_SELECT,
  PAYROLL_PERIOD_SELECT,
  type PayrollPeriodRow,
  toPayrollItemDto,
  toPayrollPeriodDto,
} from './payroll.mapper.js';

type Summary = { itemCount: number; totalNet: Prisma.Decimal };

/**
 * Periode payroll: buat, daftar, detail, dan perubahan status
 * DRAFT -> FINAL -> PAID (FINAL bisa dibuka kembali ke DRAFT). Setiap
 * perubahan status atomik (updateMany dengan status lama di where) di bawah
 * advisory lock periode, dan dicatat di AuditLog.
 */
@Injectable()
export class PayrollPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /** Buat periode DRAFT kosong; isi dengan POST /payroll-periods/:id/run. */
  async create(dto: CreatePayrollPeriodDto): Promise<PayrollPeriodResponseDto> {
    assertPeriodCreatable(dto.period, toWibDateOnly(this.clock.now()));
    try {
      const row = await this.prisma.client.$transaction(async (tx) => {
        const created = await tx.payrollPeriod.create({
          data: { period: dto.period },
          select: PAYROLL_PERIOD_SELECT,
        });
        await this.audit.recordChange(
          {
            entity: PayrollEntities.period,
            entityId: created.id,
            after: { period: created.period, status: created.status },
          },
          tx,
        );
        return created;
      });
      return toPayrollPeriodDto(row, emptySummary());
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(PayrollMessages.periodExists);
      }
      throw error;
    }
  }

  /** Semua periode, terbaru dulu, dengan jumlah slip dan total take home pay. */
  async list(
    query: ListPayrollPeriodsQueryDto,
  ): Promise<PayrollPeriodResponseDto[]> {
    const rows = await this.prisma.client.payrollPeriod.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: { period: 'desc' },
      select: PAYROLL_PERIOD_SELECT,
    });
    const sums = await this.prisma.client.payrollItem.groupBy({
      by: ['periodId'],
      where: { periodId: { in: rows.map((row) => row.id) } },
      _count: { _all: true },
      _sum: { net: true },
    });
    const byPeriod = new Map(sums.map((sum) => [sum.periodId, sum]));
    return rows.map((row) => {
      const sum = byPeriod.get(row.id);
      return toPayrollPeriodDto(row, {
        itemCount: sum?._count._all ?? 0,
        totalNet: sum?._sum.net ?? zeroMoney(),
      });
    });
  }

  /** Detail: semua slip (urut NIP) dan totalnya. */
  async findOne(id: string): Promise<PayrollPeriodDetailResponseDto> {
    const row = await this.findPeriod(id);
    const items = await this.prisma.client.payrollItem.findMany({
      where: { periodId: id },
      orderBy: { nip: 'asc' },
      select: PAYROLL_ITEM_SELECT,
    });
    const totals = sumItems(items);
    return {
      ...toPayrollPeriodDto(row, {
        itemCount: totals.itemCount,
        totalNet: totals.net,
      }),
      items: items.map(toPayrollItemDto),
      totals: toTotalsJson(totals),
    };
  }

  /** Rekap bagian perusahaan per program dan per karyawan (bukan potongan slip). */
  async employerContributions(
    id: string,
  ): Promise<EmployerContributionReportDto> {
    const row = await this.findPeriod(id);
    const items = await this.prisma.client.payrollItem.findMany({
      where: { periodId: id },
      orderBy: { nip: 'asc' },
      select: PAYROLL_ITEM_SELECT,
    });
    return {
      periodId: row.id,
      period: row.period,
      status: row.status,
      totals: toEmployerContributionsJson(sumItems(items).employer),
      items: items.map((item) => ({
        employeeId: item.employeeId,
        nip: item.nip,
        employeeName: item.employeeName,
        departmentName: item.departmentName,
        contributions: toEmployerContributionsJson(
          parseEmployerContributions(item.employerContributions),
        ),
      })),
    };
  }

  /** DRAFT -> FINAL. Butuh minimal satu slip dan tidak ada take home pay negatif. */
  async finalize(id: string, actor: AuthUser) {
    return this.transition(id, PayrollPeriodStatus.FINAL, async (tx) => {
      const items = await tx.payrollItem.findMany({
        where: { periodId: id },
        select: { id: true, nip: true, employeeName: true, net: true },
      });
      assertFinalizable(items);
      return {
        data: { finalizedById: actor.id, finalizedAt: this.clock.now() },
        audit: { itemCount: items.length },
      };
    });
  }

  /** FINAL -> PAID. Setelah ini periode tidak bisa dibuka atau diubah lagi. */
  async markPaid(id: string) {
    return this.transition(id, PayrollPeriodStatus.PAID, () =>
      Promise.resolve({ data: { paidAt: this.clock.now() }, audit: {} }),
    );
  }

  /** FINAL -> DRAFT untuk koreksi. Alasan wajib, dicatat di AuditLog. */
  async reopen(id: string, reason: string) {
    return this.transition(id, PayrollPeriodStatus.DRAFT, () =>
      Promise.resolve({
        data: { finalizedById: null, finalizedAt: null },
        audit: { reason },
      }),
    );
  }

  /**
   * Perubahan status di satu transaksi: lock periode, cek transisi dengan
   * status terbaru, cek tambahan (`prepare`), updateMany bersyarat status
   * lama (count 0 = 409), lalu AuditLog before/after.
   */
  private async transition(
    id: string,
    to: PayrollPeriodStatus,
    prepare: (tx: AppTransactionClient) => Promise<{
      data: Prisma.PayrollPeriodUncheckedUpdateManyInput;
      audit: Record<string, unknown>;
    }>,
  ): Promise<PayrollPeriodDetailResponseDto> {
    await this.prisma.client.$transaction(async (tx) => {
      await lockPayrollPeriod(tx, id);
      const current = await tx.payrollPeriod.findUnique({
        where: { id },
        select: {
          period: true,
          status: true,
          finalizedById: true,
          finalizedAt: true,
          paidAt: true,
        },
      });
      if (!current) {
        throw new NotFoundException(PayrollMessages.periodNotFound);
      }
      assertPeriodTransition(current.status, to);
      const { data, audit } = await prepare(tx);
      const { count } = await tx.payrollPeriod.updateMany({
        where: { id, status: current.status },
        data: { ...data, status: to },
      });
      if (count === 0) {
        throw new ConflictException(PayrollMessages.alreadyChanged);
      }
      await this.audit.recordChange(
        {
          entity: PayrollEntities.period,
          entityId: id,
          before: {
            period: current.period,
            status: current.status,
            finalizedById: current.finalizedById,
            finalizedAt: current.finalizedAt,
            paidAt: current.paidAt,
          },
          after: {
            period: current.period,
            status: to,
            statusLabel: PERIOD_STATUS_LABELS[to],
            ...data,
            ...audit,
          },
        },
        tx,
      );
    });
    return this.findOne(id);
  }

  private async findPeriod(id: string): Promise<PayrollPeriodRow> {
    const row = await this.prisma.client.payrollPeriod.findUnique({
      where: { id },
      select: PAYROLL_PERIOD_SELECT,
    });
    if (!row) {
      throw new NotFoundException(PayrollMessages.periodNotFound);
    }
    return row;
  }
}

function emptySummary(): Summary {
  return { itemCount: 0, totalNet: zeroMoney() };
}
