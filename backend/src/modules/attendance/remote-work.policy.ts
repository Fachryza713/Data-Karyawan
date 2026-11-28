import { AttendanceMode } from '../../generated/prisma/enums.js';

export type RemoteWorkMode =
  typeof AttendanceMode.WFH | typeof AttendanceMode.BUSINESS_TRIP;

export type ApprovedRemoteWork = { mode: RemoteWorkMode };

/**
 * Sumber izin kerja di luar kantor (WFH atau dinas luar) yang sudah
 * disetujui. Absen di luar radius hanya diterima jika ada izin ini.
 * Implementasi: ApprovedRemoteWorkPolicy di modul leave.
 */
export interface RemoteWorkPolicy {
  /** `date` adalah tanggal WIB "YYYY-MM-DD". Null jika tidak ada izin. */
  hasApprovedRemote(
    employeeId: string,
    date: string,
  ): Promise<ApprovedRemoteWork | null>;
}

export const REMOTE_WORK_POLICY = Symbol('REMOTE_WORK_POLICY');
