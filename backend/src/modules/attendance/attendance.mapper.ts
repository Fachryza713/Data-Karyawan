import { toDateOnly } from '../../common/validation/date-only.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { toWibClock } from './attendance-rules.js';
import type {
  AttendanceResponseDto,
  ClockPointDto,
} from './dto/attendance-response.dto.js';

export const ATTENDANCE_SELECT = {
  id: true,
  date: true,
  status: true,
  mode: true,
  lateMinutes: true,
  clockInAt: true,
  clockInLat: true,
  clockInLng: true,
  clockInDistanceM: true,
  clockInAccuracyM: true,
  clockOutAt: true,
  clockOutLat: true,
  clockOutLng: true,
  clockOutDistanceM: true,
  clockOutAccuracyM: true,
  updatedAt: true,
} as const satisfies Prisma.AttendanceSelect;

export type AttendanceRow = Prisma.AttendanceGetPayload<{
  select: typeof ATTENDANCE_SELECT;
}>;

function toClockPoint(
  at: Date | null,
  lat: Prisma.Decimal | null,
  lng: Prisma.Decimal | null,
  distanceM: number | null,
  accuracyM: Prisma.Decimal | null,
): ClockPointDto | null {
  // CHECK constraint menjamin kolom lokasi terisi bersama waktunya.
  if (!at || !lat || !lng || distanceM === null || !accuracyM) {
    return null;
  }
  return {
    at: at.toISOString(),
    time: toWibClock(at).time,
    lat: lat.toNumber(),
    lng: lng.toNumber(),
    distanceM,
    accuracyM: accuracyM.toNumber(),
  };
}

export function toAttendanceDto(row: AttendanceRow): AttendanceResponseDto {
  return {
    id: row.id,
    date: toDateOnly(row.date),
    status: row.status,
    mode: row.mode,
    lateMinutes: row.lateMinutes,
    clockIn: toClockPoint(
      row.clockInAt,
      row.clockInLat,
      row.clockInLng,
      row.clockInDistanceM,
      row.clockInAccuracyM,
    ),
    clockOut: toClockPoint(
      row.clockOutAt,
      row.clockOutLat,
      row.clockOutLng,
      row.clockOutDistanceM,
      row.clockOutAccuracyM,
    ),
    updatedAt: row.updatedAt.toISOString(),
  };
}
