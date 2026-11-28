import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildPageMeta,
  pageToSkipTake,
} from '../../common/dto/pagination.dto.js';
import { Clock } from '../../common/time/clock.js';
import {
  parseDateOnly,
  toDateOnly,
  toWibDateOnly,
} from '../../common/validation/date-only.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  LeaveRequestKind,
  LeaveRequestStatus,
} from '../../generated/prisma/enums.js';
import {
  PG_EXCLUSION_VIOLATION,
  postgresErrorCode,
} from '../../prisma/prisma-errors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { HolidayService } from '../settings/holiday.service.js';
import { StorageService } from '../storage/storage.service.js';
import {
  assertUploadAllowed,
  LEAVE_ATTACHMENT_UPLOAD_POLICY,
} from '../storage/upload-policy.js';
import type {
  AttachmentUploadUrlDto,
  CreateLeaveRequestDto,
  ListMyLeaveRequestsQueryDto,
} from './dto/leave-request.dto.js';
import type {
  AttachmentUploadUrlResponseDto,
  LeaveRequestResponseDto,
  LeaveTypeResponseDto,
  MyLeaveRequestPageDto,
} from './dto/leave-response.dto.js';
import { LeaveBalanceService } from './leave-balance.service.js';
import {
  assertAttachmentRule,
  assertDateRange,
  assertHasWorkingDays,
  assertRequestShape,
  assertSingleYear,
  assertSubmissionWindow,
  assertTransition,
  assertWithinQuota,
  type DateRange,
  yearOf,
} from './leave-rules.js';
import {
  isAttachmentKeyOf,
  LEAVE_REQUEST_ENTITY,
  LeaveMessages,
  newAttachmentKey,
} from './leave.constants.js';
import {
  LEAVE_REQUEST_SELECT,
  LEAVE_TYPE_SELECT,
  type LeaveTypeRow,
  leaveRequestSnapshot,
  toLeaveRequestDto,
  toLeaveTypeDto,
} from './leave.mapper.js';
import { findOwnEmployeeId } from './own-employee.js';

/** Status yang menahan tanggal: pengajuan baru tidak boleh beririsan dengannya. */
const BLOCKING_STATUSES = [
  LeaveRequestStatus.PENDING,
  LeaveRequestStatus.APPROVED,
];

/**
 * Pengajuan cuti, WFH, dan dinas luar oleh karyawan yang login. Semua aturan
 * bisnis dicek di sini (lihat leave-rules.ts); persetujuan HR ada di
 * LeaveReviewService.
 */
@Injectable()
export class LeaveRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly holidays: HolidayService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly balances: LeaveBalanceService,
    private readonly clock: Clock,
  ) {}

  async listLeaveTypes(): Promise<LeaveTypeResponseDto[]> {
    const rows = await this.prisma.client.leaveType.findMany({
      orderBy: { code: 'asc' },
      select: LEAVE_TYPE_SELECT,
    });
    return rows.map(toLeaveTypeDto);
  }

  /**
   * Ajukan cuti/WFH/dinas. Urutan cek: bentuk input dan tanggal (400/422),
   * hari kerja, aturan jenis cuti (lintas tahun, lampiran, kuota), tumpang
   * tindih (409), lalu lampiran di storage (HeadObject). EXCLUDE constraint
   * di database menutup race dua submit bersamaan (juga 409).
   */
  async submit(
    userId: string,
    dto: CreateLeaveRequestDto,
  ): Promise<LeaveRequestResponseDto> {
    const employeeId = await findOwnEmployeeId(this.prisma, userId);
    const range: DateRange = { start: dto.startDate, end: dto.endDate };
    assertDateRange(range);
    assertRequestShape(dto);
    assertSubmissionWindow(dto.kind, range, toWibDateOnly(this.clock.now()));

    const leaveType =
      dto.kind === LeaveRequestKind.LEAVE
        ? await this.findLeaveType(dto.leaveTypeId!)
        : null;
    if (leaveType) {
      assertSingleYear(leaveType, range);
    }
    const workingDays = await this.holidays.workingDaysBetween(
      range.start,
      range.end,
    );
    assertHasWorkingDays(workingDays);
    if (leaveType) {
      assertAttachmentRule(leaveType, workingDays, dto.attachmentKey);
      if (leaveType.deductsQuota) {
        await this.assertQuota(employeeId, range, workingDays);
      }
    }
    await this.assertNoOverlap(employeeId, range);
    if (dto.attachmentKey !== undefined) {
      await this.assertAttachmentUploaded(employeeId, dto.attachmentKey);
    }

    try {
      const row = await this.prisma.client.$transaction(async (tx) => {
        const created = await tx.leaveRequest.create({
          data: {
            employeeId,
            kind: dto.kind,
            leaveTypeId: leaveType?.id ?? null,
            startDate: parseDateOnly(range.start),
            endDate: parseDateOnly(range.end),
            workingDays,
            reason: dto.reason,
            destination: dto.destination ?? null,
            attachmentKey: dto.attachmentKey ?? null,
          },
          select: LEAVE_REQUEST_SELECT,
        });
        await this.audit.recordChange(
          {
            entity: LEAVE_REQUEST_ENTITY,
            entityId: created.id,
            after: leaveRequestSnapshot(created),
          },
          tx,
        );
        return created;
      });
      return toLeaveRequestDto(row);
    } catch (error) {
      // Submit lain milik karyawan yang sama lolos cek di antara cek dan insert.
      if (postgresErrorCode(error) === PG_EXCLUSION_VIOLATION) {
        throw new ConflictException(LeaveMessages.overlap);
      }
      throw error;
    }
  }

  /**
   * Presigned POST untuk lampiran (JPG/PNG/PDF maks 2 MB, dicek sebelum URL
   * dibuat). Key leave/<employeeId>/<uuid>; policy upload mengunci tipe dan
   * ukuran yang sama di storage.
   */
  async createAttachmentUpload(
    userId: string,
    dto: AttachmentUploadUrlDto,
  ): Promise<AttachmentUploadUrlResponseDto> {
    const employeeId = await findOwnEmployeeId(this.prisma, userId);
    assertUploadAllowed(LEAVE_ATTACHMENT_UPLOAD_POLICY, dto);
    const upload = await this.storage.createPresignedUpload(
      newAttachmentKey(employeeId),
      dto.contentType,
      LEAVE_ATTACHMENT_UPLOAD_POLICY.maxBytes,
    );
    return {
      key: upload.key,
      method: 'POST',
      url: upload.url,
      fields: upload.fields,
      maxBytes: upload.maxBytes,
      expiresAt: upload.expiresAt.toISOString(),
    };
  }

  /** Riwayat pengajuan milik sendiri, terbaru dulu. */
  async listMine(
    userId: string,
    query: ListMyLeaveRequestsQueryDto,
  ): Promise<MyLeaveRequestPageDto> {
    const employeeId = await findOwnEmployeeId(this.prisma, userId);
    const where: Prisma.LeaveRequestWhereInput = {
      employeeId,
      ...(query.status && { status: query.status }),
      ...(query.kind && { kind: query.kind }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.client.leaveRequest.findMany({
        where,
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        ...pageToSkipTake(query.page, query.limit),
        select: LEAVE_REQUEST_SELECT,
      }),
      this.prisma.client.leaveRequest.count({ where }),
    ]);
    return {
      data: rows.map(toLeaveRequestDto),
      meta: buildPageMeta(query.page, query.limit, total),
    };
  }

  /**
   * Batalkan pengajuan milik sendiri yang masih PENDING. Perubahan status
   * atomik: updateMany dengan `status: PENDING` di where; 0 baris = sudah
   * diproses HR di antara cek dan update (409).
   */
  async cancel(userId: string, id: string): Promise<LeaveRequestResponseDto> {
    const employeeId = await findOwnEmployeeId(this.prisma, userId);
    const current = await this.prisma.client.leaveRequest.findFirst({
      where: { id, employeeId },
      select: { status: true },
    });
    if (!current) {
      // Pengajuan orang lain juga 404: keberadaannya tidak dibocorkan.
      throw new NotFoundException(LeaveMessages.notFound);
    }
    assertTransition(current.status, LeaveRequestStatus.CANCELLED);

    const row = await this.prisma.client.$transaction(async (tx) => {
      const { count } = await tx.leaveRequest.updateMany({
        where: { id, employeeId, status: LeaveRequestStatus.PENDING },
        data: { status: LeaveRequestStatus.CANCELLED },
      });
      if (count === 0) {
        throw new ConflictException(LeaveMessages.alreadyProcessed);
      }
      await this.audit.recordChange(
        {
          entity: LEAVE_REQUEST_ENTITY,
          entityId: id,
          before: { status: LeaveRequestStatus.PENDING },
          after: { status: LeaveRequestStatus.CANCELLED },
        },
        tx,
      );
      return tx.leaveRequest.findUniqueOrThrow({
        where: { id },
        select: LEAVE_REQUEST_SELECT,
      });
    });
    return toLeaveRequestDto(row);
  }

  private async findLeaveType(id: string): Promise<LeaveTypeRow> {
    const type = await this.prisma.client.leaveType.findUnique({
      where: { id },
      select: LEAVE_TYPE_SELECT,
    });
    if (!type) {
      throw new BadRequestException(LeaveMessages.leaveTypeNotFound);
    }
    return type;
  }

  private async assertQuota(
    employeeId: string,
    range: DateRange,
    workingDays: number,
  ): Promise<void> {
    const type = await this.balances.findQuotaType();
    if (!type) {
      throw new NotFoundException(LeaveMessages.noAnnualLeaveType);
    }
    const balance = await this.balances.snapshot(
      employeeId,
      yearOf(range.start),
      type,
    );
    assertWithinQuota(balance, workingDays);
  }

  /** 409 jika beririsan dengan pengajuan PENDING/APPROVED milik sendiri. */
  private async assertNoOverlap(
    employeeId: string,
    range: DateRange,
  ): Promise<void> {
    const clash = await this.prisma.client.leaveRequest.findFirst({
      where: {
        employeeId,
        status: { in: BLOCKING_STATUSES },
        startDate: { lte: parseDateOnly(range.end) },
        endDate: { gte: parseDateOnly(range.start) },
      },
      orderBy: { startDate: 'asc' },
      select: {
        id: true,
        kind: true,
        status: true,
        startDate: true,
        endDate: true,
      },
    });
    if (clash) {
      throw new ConflictException({
        message: LeaveMessages.overlap,
        details: {
          requestId: clash.id,
          kind: clash.kind,
          status: clash.status,
          startDate: toDateOnly(clash.startDate),
          endDate: toDateOnly(clash.endDate),
        },
      });
    }
  }

  /**
   * Key harus dari upload-url milik karyawan ini, dan object-nya harus ada
   * di storage (HeadObject) dengan tipe dan ukuran yang diizinkan.
   */
  private async assertAttachmentUploaded(
    employeeId: string,
    key: string,
  ): Promise<void> {
    if (!isAttachmentKeyOf(employeeId, key)) {
      throw new BadRequestException(LeaveMessages.invalidAttachmentKey);
    }
    const object = await this.storage.stat(key);
    if (!object) {
      throw new BadRequestException(LeaveMessages.attachmentNotUploaded);
    }
    const policy = LEAVE_ATTACHMENT_UPLOAD_POLICY;
    if (
      object.size > policy.maxBytes ||
      !object.contentType ||
      !policy.allowedContentTypes.includes(object.contentType)
    ) {
      throw new BadRequestException(LeaveMessages.invalidAttachmentFile);
    }
  }
}
