import { Injectable } from '@nestjs/common';
import { parseDateOnly } from '../../common/validation/date-only.js';
import {
  LeaveRequestKind,
  LeaveRequestStatus,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  ApprovedRemoteWork,
  RemoteWorkPolicy,
} from '../attendance/remote-work.policy.js';
import { remoteModeFor } from './leave-rules.js';

const REMOTE_KINDS = [LeaveRequestKind.WFH, LeaveRequestKind.BUSINESS_TRIP];

/**
 * Izin kerja di luar kantor dari pengajuan: WFH atau BUSINESS_TRIP yang
 * APPROVED dan rentangnya mencakup tanggal itu. PENDING, REJECTED, dan
 * CANCELLED tidak membuka absen di luar radius. Dipasang ke AttendanceModule
 * lewat token REMOTE_WORK_POLICY.
 */
@Injectable()
export class ApprovedRemoteWorkPolicy implements RemoteWorkPolicy {
  constructor(private readonly prisma: PrismaService) {}

  async hasApprovedRemote(
    employeeId: string,
    date: string,
  ): Promise<ApprovedRemoteWork | null> {
    const day = parseDateOnly(date);
    // EXCLUDE constraint menjamin paling banyak satu pengajuan disetujui per tanggal.
    const request = await this.prisma.client.leaveRequest.findFirst({
      where: {
        employeeId,
        kind: { in: REMOTE_KINDS },
        status: LeaveRequestStatus.APPROVED,
        startDate: { lte: day },
        endDate: { gte: day },
      },
      select: { kind: true },
    });
    if (!request || request.kind === LeaveRequestKind.LEAVE) {
      return null;
    }
    return { mode: remoteModeFor(request.kind) };
  }
}
