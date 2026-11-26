import { Injectable } from '@nestjs/common';
import { AttendanceMode } from '../../generated/prisma/enums.js';

export type RemoteWorkMode =
  typeof AttendanceMode.WFH | typeof AttendanceMode.BUSINESS_TRIP;

export type ApprovedRemoteWork = { mode: RemoteWorkMode };

/**
 * Sumber izin kerja di luar kantor (WFH atau dinas luar) yang sudah
 * disetujui. Absen di luar radius hanya diterima jika ada izin ini.
 */
export interface RemoteWorkPolicy {
  /** `date` adalah tanggal WIB "YYYY-MM-DD". Null jika tidak ada izin. */
  hasApprovedRemote(
    employeeId: string,
    date: string,
  ): Promise<ApprovedRemoteWork | null>;
}

export const REMOTE_WORK_POLICY = Symbol('REMOTE_WORK_POLICY');

/**
 * Implementasi sementara: modul pengajuan WFH/dinas belum ada, jadi tidak
 * pernah ada izin. Diganti di prompt cuti/WFH lewat provider
 * REMOTE_WORK_POLICY, tanpa mengubah AttendanceService.
 */
@Injectable()
export class NoRemoteWorkPolicy implements RemoteWorkPolicy {
  hasApprovedRemote(): Promise<ApprovedRemoteWork | null> {
    return Promise.resolve(null);
  }
}
