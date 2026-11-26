import { ApiProperty } from '@nestjs/swagger';
import { NamedRefDto } from '../../../common/dto/named-ref.dto.js';
import { PageMetaDto } from '../../../common/dto/pagination.dto.js';
import {
  AttendanceMode,
  AttendanceStatus,
} from '../../../generated/prisma/enums.js';
import {
  ATTENDANCE_LOG_STATUSES,
  type AttendanceLogStatus,
} from '../attendance.constants.js';

export class ClockPointDto {
  @ApiProperty({ format: 'date-time', description: 'Waktu server.' })
  at: string;

  @ApiProperty({ example: '08:27', description: 'Jam WIB.' })
  time: string;

  @ApiProperty({ example: -6.224901 })
  lat: number;

  @ApiProperty({ example: 106.809912 })
  lng: number;

  @ApiProperty({
    example: 14,
    description: 'Jarak ke titik kantor (meter), dihitung server.',
  })
  distanceM: number;

  @ApiProperty({ example: 12.5, description: 'Akurasi GPS (meter).' })
  accuracyM: number;
}

export class AttendanceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '2026-11-26', format: 'date' })
  date: string;

  @ApiProperty({ enum: AttendanceStatus, example: AttendanceStatus.ON_TIME })
  status: AttendanceStatus;

  @ApiProperty({
    enum: AttendanceMode,
    nullable: true,
    description: 'Null untuk cuti, sakit, izin, alpa.',
  })
  mode: AttendanceMode | null;

  @ApiProperty({ example: 0 })
  lateMinutes: number;

  @ApiProperty({ type: ClockPointDto, nullable: true })
  clockIn: ClockPointDto | null;

  @ApiProperty({ type: ClockPointDto, nullable: true })
  clockOut: ClockPointDto | null;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class ShiftRuleDto {
  @ApiProperty({ example: '08:30' })
  startTime: string;

  @ApiProperty({ example: '17:30' })
  endTime: string;

  @ApiProperty({ example: 15 })
  lateToleranceMin: number;
}

export class OfficeAreaDto {
  @ApiProperty({ example: 'Head Office Jakarta' })
  name: string;

  @ApiProperty({ example: 100 })
  radiusM: number;
}

export class TodayAttendanceResponseDto {
  @ApiProperty({ example: '2026-11-26', format: 'date' })
  date: string;

  @ApiProperty({ description: 'Senin-Jumat dan bukan hari libur.' })
  isWorkingDay: boolean;

  @ApiProperty({ type: ShiftRuleDto })
  shift: ShiftRuleDto;

  @ApiProperty({ type: OfficeAreaDto })
  office: OfficeAreaDto;

  @ApiProperty({
    enum: [AttendanceMode.WFH, AttendanceMode.BUSINESS_TRIP],
    nullable: true,
    description: 'Izin WFH/dinas yang disetujui untuk hari ini.',
  })
  approvedRemoteMode: AttendanceMode | null;

  @ApiProperty({ type: AttendanceResponseDto, nullable: true })
  attendance: AttendanceResponseDto | null;
}

export class MonthSummaryDto {
  @ApiProperty({ example: 18, description: 'Hari dengan absen masuk.' })
  present: number;

  @ApiProperty({
    example: 2,
    description: 'Hari terlambat, termasuk yang kemudian pulang cepat.',
  })
  late: number;

  @ApiProperty({ example: 1 })
  earlyLeave: number;

  @ApiProperty({ example: 1, description: 'Cuti.' })
  leave: number;

  @ApiProperty({ example: 0 })
  sick: number;

  @ApiProperty({ example: 0, description: 'Izin.' })
  permit: number;

  @ApiProperty({ example: 1, description: 'Alpa.' })
  absent: number;
}

export class MyMonthlyAttendanceResponseDto {
  @ApiProperty({ example: '2026-11' })
  month: string;

  @ApiProperty({
    example: 21,
    description: 'Hari kerja sebulan penuh (tanpa akhir pekan dan libur).',
  })
  workingDays: number;

  @ApiProperty({ type: MonthSummaryDto })
  summary: MonthSummaryDto;

  @ApiProperty({ type: [AttendanceResponseDto] })
  items: AttendanceResponseDto[];
}

// ---------------------------------------------------------------------------
// HR
// ---------------------------------------------------------------------------

export class AttendanceEmployeeDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'BRT-2024-0003' })
  nip: string;

  @ApiProperty({ example: 'Raditya Pratama' })
  fullName: string;

  @ApiProperty({ type: NamedRefDto })
  department: NamedRefDto;

  @ApiProperty({ type: NamedRefDto })
  position: NamedRefDto;
}

export class AttendanceLogItemDto {
  @ApiProperty({ example: '2026-11-26', format: 'date' })
  date: string;

  @ApiProperty({ enum: ATTENDANCE_LOG_STATUSES })
  status: AttendanceLogStatus;

  @ApiProperty({ type: AttendanceEmployeeDto })
  employee: AttendanceEmployeeDto;

  @ApiProperty({
    type: AttendanceResponseDto,
    nullable: true,
    description: 'Null jika status NOT_YET.',
  })
  attendance: AttendanceResponseDto | null;
}

export class AttendanceLogMetaDto extends PageMetaDto {
  @ApiProperty({ example: '2026-11-26', format: 'date' })
  from: string;

  @ApiProperty({ example: '2026-11-26', format: 'date' })
  to: string;
}

export class AttendanceLogPageDto {
  @ApiProperty({ type: [AttendanceLogItemDto] })
  data: AttendanceLogItemDto[];

  @ApiProperty({ type: AttendanceLogMetaDto })
  meta: AttendanceLogMetaDto;
}

export class AttendanceStatusCountsDto {
  @ApiProperty() ON_TIME: number;
  @ApiProperty() LATE: number;
  @ApiProperty() EARLY_LEAVE: number;
  @ApiProperty() LEAVE: number;
  @ApiProperty() SICK: number;
  @ApiProperty() PERMIT: number;
  @ApiProperty() ABSENT: number;
  @ApiProperty({ description: 'Belum punya baris absensi.' }) NOT_YET: number;
}

export class AttendanceSummaryResponseDto {
  @ApiProperty({ example: '2026-11-26', format: 'date' })
  date: string;

  @ApiProperty()
  isWorkingDay: boolean;

  @ApiProperty({ example: 29, description: 'Karyawan yang dihitung.' })
  total: number;

  @ApiProperty({ type: AttendanceStatusCountsDto })
  byStatus: AttendanceStatusCountsDto;
}
