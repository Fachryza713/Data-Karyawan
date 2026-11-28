import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/auth/auth-user.js';
import {
  buildPageMeta,
  pageToSkipTake,
} from '../../common/dto/pagination.dto.js';
import { Clock } from '../../common/time/clock.js';
import {
  parseDateOnly,
  toDateOnly,
} from '../../common/validation/date-only.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  LeaveRequestKind,
  LeaveRequestStatus,
} from '../../generated/prisma/enums.js';
import {
  type AppTransactionClient,
  PrismaService,
} from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { HolidayService } from '../settings/holiday.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { ListLeaveRequestsQueryDto } from './dto/leave-request.dto.js';
import type {
  HrLeaveRequestPageDto,
  LeaveRequestDetailResponseDto,
} from './dto/leave-response.dto.js';
import { LeaveBalanceService } from './leave-balance.service.js';
import {
  assertHasWorkingDays,
  assertNotOwnRequest,
  assertTransition,
  attendanceStatusFor,
  yearOf,
} from './leave-rules.js';
import {
  ATTACHMENT_URL_TTL_SECONDS,
  LEAVE_REQUEST_ENTITY,
  LeaveMessages,
} from './leave.constants.js';
import {
  HR_LEAVE_REQUEST_SELECT,
  type HrLeaveRequestRow,
  toHrLeaveRequestDto,
} from './leave.mapper.js';

/** Data pengajuan yang dibutuhkan untuk memutuskan approve/reject. */
const REVIEW_SELECT = {
  id: true,
  employeeId: true,
  kind: true,
  status: true,
  startDate: true,
  endDate: true,
  workingDays: true,
  employee: { select: { userId: true } },
  leaveType: { select: { code: true, deductsQuota: true } },
} as const satisfies Prisma.LeaveRequestSelect;

type ReviewRow = Prisma.LeaveRequestGetPayload<{
  select: typeof REVIEW_SELECT;
}>;

/** Hasil penulisan presensi saat cuti disetujui, untuk AuditLog. */
type AttendanceMarking = {
  status: string;
  days: number;
  created: number;
  updated: number;
};

/**
 * Daftar, detail, dan keputusan HR atas pengajuan. Setiap perubahan status
 * memakai updateMany dengan `status: PENDING` di where, jadi status final
 * tidak pernah tertimpa dan dua keputusan bersamaan hanya satu yang menang.
 */
@Injectable()
export class LeaveReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly holidays: HolidayService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly balances: LeaveBalanceService,
    private readonly clock: Clock,
  ) {}

  /** Daftar HR: urut tanggal mulai terdekat (PRD US-09). */
  async list(query: ListLeaveRequestsQueryDto): Promise<HrLeaveRequestPageDto> {
    if (query.from && query.to && query.to < query.from) {
      throw new BadRequestException('to tidak boleh sebelum from');
    }
    const where: Prisma.LeaveRequestWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.kind && { kind: query.kind }),
      ...(query.departmentId && {
        employee: { departmentId: query.departmentId },
      }),
      // Beririsan dengan from-to: mulai sebelum `to` dan selesai setelah `from`.
      ...(query.to && { startDate: { lte: parseDateOnly(query.to) } }),
      ...(query.from && { endDate: { gte: parseDateOnly(query.from) } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.client.leaveRequest.findMany({
        where,
        orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        ...pageToSkipTake(query.page, query.limit),
        select: HR_LEAVE_REQUEST_SELECT,
      }),
      this.prisma.client.leaveRequest.count({ where }),
    ]);
    return {
      data: rows.map(toHrLeaveRequestDto),
      meta: buildPageMeta(query.page, query.limit, total),
    };
  }

  /**
   * Detail untuk HR: presigned URL lampiran (berlaku 5 menit) dan saldo
   * tahun pengajuan untuk jenis yang mengurangi kuota.
   */
  async findOne(id: string): Promise<LeaveRequestDetailResponseDto> {
    const row = await this.findHrRow(id);
    const [attachment, balance] = await Promise.all([
      row.attachmentKey ? this.attachmentLink(row.attachmentKey) : null,
      row.leaveType?.deductsQuota
        ? this.balances.summary(
            row.employeeId,
            yearOf(toDateOnly(row.startDate)),
          )
        : null,
    ]);
    return { ...toHrLeaveRequestDto(row), attachment, balance };
  }

  /**
   * Setujui dalam satu transaksi:
   * 1. status PENDING -> APPROVED secara kondisional (0 baris = 409);
   * 2. cuti tahunan: potong saldo dengan UPDATE bersyarat (tidak cukup = 409);
   * 3. kind LEAVE: baris presensi LEAVE/SICK/PERMIT per hari kerja;
   * 4. AuditLog.
   * Exception di langkah mana pun me-rollback semuanya.
   */
  async approve(
    id: string,
    actor: AuthUser,
    note?: string,
  ): Promise<LeaveRequestDetailResponseDto> {
    const request = await this.findForReview(id, actor);
    assertTransition(request.status, LeaveRequestStatus.APPROVED);

    // Hari kerja dihitung ulang: daftar libur bisa berubah sejak diajukan.
    const start = toDateOnly(request.startDate);
    const end = toDateOnly(request.endDate);
    const leaveDates =
      request.kind === LeaveRequestKind.LEAVE
        ? await this.holidays.workingDatesBetween(start, end)
        : null;
    const workingDays =
      leaveDates?.length ??
      (await this.holidays.workingDaysBetween(start, end));
    assertHasWorkingDays(workingDays, LeaveMessages.noWorkingDaysAtReview);
    const quotaType = request.leaveType?.deductsQuota
      ? await this.balances.findQuotaType()
      : null;
    const reviewNote = note ?? null;
    const reviewedAt = this.clock.now();

    await this.prisma.client.$transaction(async (tx) => {
      const { count } = await tx.leaveRequest.updateMany({
        where: { id, status: LeaveRequestStatus.PENDING },
        data: {
          status: LeaveRequestStatus.APPROVED,
          reviewedById: actor.id,
          reviewedAt,
          reviewNote,
          workingDays,
        },
      });
      if (count === 0) {
        throw new ConflictException(LeaveMessages.alreadyProcessed);
      }

      const balance = quotaType
        ? await this.balances.consume(
            tx,
            request.employeeId,
            yearOf(start),
            workingDays,
            quotaType,
          )
        : null;
      const attendance =
        leaveDates && request.leaveType
          ? await this.markLeaveDays(
              tx,
              request.employeeId,
              leaveDates,
              attendanceStatusFor(request.leaveType.code),
            )
          : null;

      await this.audit.recordChange(
        {
          entity: LEAVE_REQUEST_ENTITY,
          entityId: id,
          before: {
            status: LeaveRequestStatus.PENDING,
            workingDays: request.workingDays,
          },
          after: {
            status: LeaveRequestStatus.APPROVED,
            reviewedById: actor.id,
            reviewNote,
            workingDays,
            ...(balance && { balance }),
            ...(attendance && { attendance }),
          },
        },
        tx,
      );
    });
    return this.findOne(id);
  }

  /** Tolak dengan catatan wajib. Atomik seperti approve (0 baris = 409). */
  async reject(
    id: string,
    actor: AuthUser,
    note: string,
  ): Promise<LeaveRequestDetailResponseDto> {
    const request = await this.findForReview(id, actor);
    assertTransition(request.status, LeaveRequestStatus.REJECTED);
    const reviewedAt = this.clock.now();

    await this.prisma.client.$transaction(async (tx) => {
      const { count } = await tx.leaveRequest.updateMany({
        where: { id, status: LeaveRequestStatus.PENDING },
        data: {
          status: LeaveRequestStatus.REJECTED,
          reviewedById: actor.id,
          reviewedAt,
          reviewNote: note,
        },
      });
      if (count === 0) {
        throw new ConflictException(LeaveMessages.alreadyProcessed);
      }
      await this.audit.recordChange(
        {
          entity: LEAVE_REQUEST_ENTITY,
          entityId: id,
          before: { status: LeaveRequestStatus.PENDING },
          after: {
            status: LeaveRequestStatus.REJECTED,
            reviewedById: actor.id,
            reviewNote: note,
          },
        },
        tx,
      );
    });
    return this.findOne(id);
  }

  /** Pengajuan untuk diproses: 404 jika tidak ada, 403 jika milik reviewer sendiri. */
  private async findForReview(id: string, actor: AuthUser): Promise<ReviewRow> {
    const request = await this.prisma.client.leaveRequest.findUnique({
      where: { id },
      select: REVIEW_SELECT,
    });
    if (!request) {
      throw new NotFoundException(LeaveMessages.notFound);
    }
    assertNotOwnRequest(request.employee.userId, actor.id);
    return request;
  }

  private async findHrRow(id: string): Promise<HrLeaveRequestRow> {
    const row = await this.prisma.client.leaveRequest.findUnique({
      where: { id },
      select: HR_LEAVE_REQUEST_SELECT,
    });
    if (!row) {
      throw new NotFoundException(LeaveMessages.notFound);
    }
    return row;
  }

  private async attachmentLink(key: string) {
    const url = await this.storage.createPresignedDownload(
      key,
      ATTACHMENT_URL_TTL_SECONDS,
    );
    const expiresAt = new Date(
      this.clock.now().getTime() + ATTACHMENT_URL_TTL_SECONDS * 1000,
    );
    return { url, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Satu baris presensi per hari kerja cuti (upsert). Hari yang belum punya
   * baris dibuat; baris tanpa absen masuk (ALPA, atau cuti lain) diubah ke
   * status cuti. Hari yang sudah absen masuk dibiarkan sebagai bukti hadir
   * (CHECK di attendances juga melarang status cuti dengan jam masuk).
   */
  private async markLeaveDays(
    tx: AppTransactionClient,
    employeeId: string,
    dates: string[],
    status: ReturnType<typeof attendanceStatusFor>,
  ): Promise<AttendanceMarking> {
    const days = dates.map(parseDateOnly);
    const created = await tx.attendance.createMany({
      data: days.map((date) => ({ employeeId, date, status })),
      skipDuplicates: true,
    });
    const updated = await tx.attendance.updateMany({
      where: {
        employeeId,
        date: { in: days },
        clockInAt: null,
        status: { not: status },
      },
      data: { status, lateMinutes: 0, mode: null },
    });
    return {
      status,
      days: dates.length,
      created: created.count,
      updated: updated.count,
    };
  }
}
