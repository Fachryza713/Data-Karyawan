import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Clock } from '../../common/time/clock.js';
import {
  parseDateOnly,
  toWibDateOnly,
} from '../../common/validation/date-only.js';
import { LeaveRequestStatus } from '../../generated/prisma/enums.js';
import {
  type AppTransactionClient,
  PrismaService,
} from '../../prisma/prisma.service.js';
import type { LeaveBalanceResponseDto } from './dto/leave-response.dto.js';
import { type BalanceSnapshot, remainingDays, yearOf } from './leave-rules.js';
import { LeaveMessages } from './leave.constants.js';
import { findOwnEmployeeId } from './own-employee.js';

/** Jenis cuti yang memotong saldo (cuti tahunan) beserta kuotanya. */
export type QuotaLeaveType = { id: string; annualQuota: number };

/** Hasil pemotongan saldo saat approve, untuk AuditLog. */
export type BalanceConsumption = {
  year: number;
  quota: number;
  usedBefore: number;
  usedAfter: number;
};

/**
 * Saldo cuti tahunan (LeaveBalance): dibuat untuk karyawan baru dan setiap
 * 1 Januari, dibaca untuk form pengajuan, dan dipotong saat approve.
 */
@Injectable()
export class LeaveBalanceService {
  private readonly logger = new Logger(LeaveBalanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** Tahun kalender WIB saat ini. */
  currentYear(): number {
    return yearOf(toWibDateOnly(this.clock.now()));
  }

  /** Null jika belum ada jenis cuti yang memotong kuota. */
  async findQuotaType(
    tx?: AppTransactionClient,
  ): Promise<QuotaLeaveType | null> {
    const db = tx ?? this.prisma.client;
    const type = await db.leaveType.findFirst({
      where: { deductsQuota: true },
      orderBy: { code: 'asc' },
      select: { id: true, annualQuota: true },
    });
    if (!type || type.annualQuota === null) {
      return null;
    }
    return { id: type.id, annualQuota: type.annualQuota };
  }

  /**
   * Saldo tahun berjalan untuk karyawan baru. Dipanggil di transaksi yang
   * sama dengan pembuatan karyawan; aman dipanggil ulang (skipDuplicates).
   * Kuota penuh untuk semua (PRD 6.3: proporsional disederhanakan).
   */
  async ensureForEmployee(
    employeeId: string,
    tx?: AppTransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma.client;
    const type = await this.findQuotaType(tx);
    if (!type) {
      this.logger.warn(
        `Saldo cuti ${employeeId} tidak dibuat: ${LeaveMessages.noAnnualLeaveType}`,
      );
      return;
    }
    await db.leaveBalance.createMany({
      data: [{ employeeId, year: this.currentYear(), quota: type.annualQuota }],
      skipDuplicates: true,
    });
  }

  /**
   * Saldo tahun `year` untuk semua karyawan aktif yang belum punya. Idempotent:
   * menjalankan ulang (atau dua instance bersamaan) tidak menggandakan baris
   * karena unique (employeeId, year) dan skipDuplicates. Mengembalikan
   * jumlah baris baru.
   */
  async createForYear(year: number): Promise<number> {
    const type = await this.findQuotaType();
    if (!type) {
      this.logger.warn(
        `Saldo cuti ${year} tidak dibuat: ${LeaveMessages.noAnnualLeaveType}`,
      );
      return 0;
    }
    const employees = await this.prisma.client.employee.findMany({
      where: {
        user: { isActive: true },
        leaveBalances: { none: { year } },
      },
      select: { id: true },
    });
    if (employees.length === 0) {
      return 0;
    }
    const { count } = await this.prisma.client.leaveBalance.createMany({
      data: employees.map((employee) => ({
        employeeId: employee.id,
        year,
        quota: type.annualQuota,
      })),
      skipDuplicates: true,
    });
    return count;
  }

  /** Saldo tersimpan, atau kuota penuh jika barisnya belum dibuat. */
  async snapshot(
    employeeId: string,
    year: number,
    type: QuotaLeaveType,
  ): Promise<BalanceSnapshot> {
    const row = await this.prisma.client.leaveBalance.findUnique({
      where: { employeeId_year: { employeeId, year } },
      select: { quota: true, used: true },
    });
    return row
      ? { year, quota: row.quota, used: row.used }
      : { year, quota: type.annualQuota, used: 0 };
  }

  /** Saldo milik karyawan yang login (GET /leave-balances/me). */
  async getMine(
    userId: string,
    year?: number,
  ): Promise<LeaveBalanceResponseDto> {
    const employeeId = await findOwnEmployeeId(this.prisma, userId);
    return this.summary(employeeId, year ?? this.currentYear());
  }

  /** Saldo satu tahun beserta hari kerja cuti tahunan yang masih PENDING. */
  async summary(
    employeeId: string,
    year: number,
  ): Promise<LeaveBalanceResponseDto> {
    const type = await this.findQuotaType();
    if (!type) {
      throw new NotFoundException(LeaveMessages.noAnnualLeaveType);
    }
    const [balance, pending] = await Promise.all([
      this.snapshot(employeeId, year, type),
      this.prisma.client.leaveRequest.aggregate({
        where: {
          employeeId,
          leaveTypeId: type.id,
          status: LeaveRequestStatus.PENDING,
          startDate: {
            gte: parseDateOnly(`${year}-01-01`),
            lte: parseDateOnly(`${year}-12-31`),
          },
        },
        _sum: { workingDays: true },
      }),
    ]);
    return {
      year,
      quota: balance.quota,
      used: balance.used,
      remaining: remainingDays(balance),
      pendingDays: pending._sum.workingDays ?? 0,
    };
  }

  /**
   * Potong saldo di dalam transaksi approve dengan SATU UPDATE bersyarat
   * (`used + n <= quota` di WHERE), bukan baca-cek-tulis. Dua approve
   * bersamaan: yang kedua menunggu row lock, lalu PostgreSQL mengevaluasi
   * ulang WHERE terhadap nilai used terbaru, jadi hanya yang muat yang
   * berhasil. 0 baris = saldo tidak cukup (409) dan transaksi di-rollback
   * karena exception. CHECK used <= quota adalah pengaman terakhir.
   */
  async consume(
    tx: AppTransactionClient,
    employeeId: string,
    year: number,
    days: number,
    type: QuotaLeaveType,
  ): Promise<BalanceConsumption> {
    // Baris saldo mungkin belum ada (karyawan lama, job tahunan belum jalan).
    await tx.leaveBalance.createMany({
      data: [{ employeeId, year, quota: type.annualQuota }],
      skipDuplicates: true,
    });
    const rows = await tx.$queryRaw<Array<{ used: number; quota: number }>>`
      UPDATE "leave_balances"
      SET "used" = "used" + ${days}, "updated_at" = now()
      WHERE "employee_id" = ${employeeId}::uuid
        AND "year" = ${year}
        AND "used" + ${days} <= "quota"
      RETURNING "used", "quota"`;
    if (rows.length === 0) {
      // Dibaca hanya untuk isi pesan; keputusan sudah diambil UPDATE di atas.
      const current = await tx.leaveBalance.findUnique({
        where: { employeeId_year: { employeeId, year } },
        select: { quota: true, used: true },
      });
      throw new ConflictException({
        message: LeaveMessages.insufficientBalance,
        details: {
          year,
          requestedDays: days,
          remainingDays: current
            ? Math.max(current.quota - current.used, 0)
            : 0,
        },
      });
    }
    const [{ used, quota }] = rows;
    return { year, quota, usedBefore: used - days, usedAfter: used };
  }
}
