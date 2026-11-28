import { toDateOnly } from '../../common/validation/date-only.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  HrLeaveRequestResponseDto,
  LeaveRequestResponseDto,
  LeaveTypeResponseDto,
} from './dto/leave-response.dto.js';

export const LEAVE_TYPE_SELECT = {
  id: true,
  code: true,
  name: true,
  annualQuota: true,
  deductsQuota: true,
  attachmentRequiredAfterDays: true,
} as const satisfies Prisma.LeaveTypeSelect;

export type LeaveTypeRow = Prisma.LeaveTypeGetPayload<{
  select: typeof LEAVE_TYPE_SELECT;
}>;

export const LEAVE_REQUEST_SELECT = {
  id: true,
  employeeId: true,
  kind: true,
  startDate: true,
  endDate: true,
  workingDays: true,
  reason: true,
  destination: true,
  attachmentKey: true,
  status: true,
  reviewedAt: true,
  reviewNote: true,
  createdAt: true,
  updatedAt: true,
  leaveType: {
    select: { id: true, code: true, name: true, deductsQuota: true },
  },
  reviewedBy: {
    select: { id: true, email: true, employee: { select: { fullName: true } } },
  },
} as const satisfies Prisma.LeaveRequestSelect;

export type LeaveRequestRow = Prisma.LeaveRequestGetPayload<{
  select: typeof LEAVE_REQUEST_SELECT;
}>;

/** Untuk HR: ditambah karyawan pengaju (termasuk yang sudah nonaktif). */
export const HR_LEAVE_REQUEST_SELECT = {
  ...LEAVE_REQUEST_SELECT,
  employee: {
    select: {
      id: true,
      userId: true,
      nip: true,
      fullName: true,
      department: { select: { id: true, name: true } },
    },
  },
} as const satisfies Prisma.LeaveRequestSelect;

export type HrLeaveRequestRow = Prisma.LeaveRequestGetPayload<{
  select: typeof HR_LEAVE_REQUEST_SELECT;
}>;

export function toLeaveTypeDto(row: LeaveTypeRow): LeaveTypeResponseDto {
  return { ...row };
}

export function toLeaveRequestDto(
  row: LeaveRequestRow,
): LeaveRequestResponseDto {
  return {
    id: row.id,
    kind: row.kind,
    leaveType: row.leaveType
      ? {
          id: row.leaveType.id,
          code: row.leaveType.code,
          name: row.leaveType.name,
        }
      : null,
    startDate: toDateOnly(row.startDate),
    endDate: toDateOnly(row.endDate),
    workingDays: row.workingDays,
    reason: row.reason,
    destination: row.destination,
    hasAttachment: row.attachmentKey !== null,
    status: row.status,
    reviewedBy: row.reviewedBy
      ? {
          id: row.reviewedBy.id,
          name: row.reviewedBy.employee?.fullName ?? row.reviewedBy.email,
        }
      : null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toHrLeaveRequestDto(
  row: HrLeaveRequestRow,
): HrLeaveRequestResponseDto {
  const { id, nip, fullName, department } = row.employee;
  return {
    ...toLeaveRequestDto(row),
    employee: { id, nip, fullName, department: { ...department } },
  };
}

/** Isi pengajuan untuk AuditLog (tanggal sebagai teks kalender). */
export function leaveRequestSnapshot(row: LeaveRequestRow) {
  return {
    employeeId: row.employeeId,
    kind: row.kind,
    leaveTypeId: row.leaveType?.id ?? null,
    startDate: toDateOnly(row.startDate),
    endDate: toDateOnly(row.endDate),
    workingDays: row.workingDays,
    reason: row.reason,
    destination: row.destination,
    attachmentKey: row.attachmentKey,
    status: row.status,
  };
}
