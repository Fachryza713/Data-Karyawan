import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { toSearchTerm } from '../../../common/validation/fields.js';
import { IsDateOnly } from '../../../common/validation/validators.js';
import {
  ATTENDANCE_LOG_STATUSES,
  type AttendanceLogStatus,
  MAX_GPS_ACCURACY_M,
  MAX_RANGE_DAYS,
} from '../attendance.constants.js';

const finite = { allowNaN: false, allowInfinity: false };

/**
 * Body absen masuk/pulang: hanya posisi mentah dari browser. Waktu, tanggal,
 * jarak, dan mode ditentukan server.
 */
export class ClockLocationDto {
  @ApiProperty({ example: -6.224901, minimum: -90, maximum: 90 })
  @IsNumber(finite, { message: 'lat harus berupa angka' })
  @Min(-90, { message: 'lat minimal -90' })
  @Max(90, { message: 'lat maksimal 90' })
  lat: number;

  @ApiProperty({ example: 106.809912, minimum: -180, maximum: 180 })
  @IsNumber(finite, { message: 'lng harus berupa angka' })
  @Min(-180, { message: 'lng minimal -180' })
  @Max(180, { message: 'lng maksimal 180' })
  lng: number;

  @ApiProperty({
    example: 12.5,
    minimum: 0,
    description: `GeolocationCoordinates.accuracy (meter). Lebih dari ${MAX_GPS_ACCURACY_M} m ditolak 422.`,
  })
  @IsNumber(finite, { message: 'accuracy harus berupa angka (meter)' })
  @Min(0, { message: 'accuracy minimal 0' })
  // Batas wajar input; aturan bisnis 100 m dicek di service (422).
  @Max(100_000, { message: 'accuracy maksimal 100000' })
  accuracy: number;
}

export class MyAttendanceQueryDto {
  @ApiPropertyOptional({
    example: '2026-11',
    description: 'Bulan YYYY-MM. Kosong = bulan ini (WIB).',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month harus berformat YYYY-MM, contoh 2026-11',
  })
  month?: string;
}

export class AttendanceSummaryQueryDto {
  @ApiPropertyOptional({
    example: '2026-11-26',
    format: 'date',
    description: 'Kosong = hari ini (WIB).',
  })
  @IsOptional()
  @IsDateOnly()
  date?: string;
}

/** Filter log HR, dipakai daftar dan ekspor CSV. */
export class AttendanceFilterQueryDto {
  @ApiPropertyOptional({
    example: '2026-11-26',
    format: 'date',
    description:
      'Satu tanggal: karyawan yang belum absen ikut tampil dengan status NOT_YET. ' +
      'Tidak boleh bersama from-to. Tanpa date dan from-to = hari ini (WIB).',
  })
  @IsOptional()
  @IsDateOnly()
  date?: string;

  @ApiPropertyOptional({
    example: '2026-11-01',
    format: 'date',
    description: `Rentang (bersama to), maksimal ${MAX_RANGE_DAYS} hari. Hanya baris yang ada.`,
  })
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30', format: 'date' })
  @IsOptional()
  @IsDateOnly()
  to?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'departmentId harus UUID' })
  departmentId?: string;

  @ApiPropertyOptional({
    enum: ATTENDANCE_LOG_STATUSES,
    description: 'NOT_YET hanya untuk satu tanggal.',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_LOG_STATUSES, {
    message: `status harus salah satu dari: ${ATTENDANCE_LOG_STATUSES.join(', ')}`,
  })
  status?: AttendanceLogStatus;

  @ApiPropertyOptional({
    example: 'raditya',
    description: 'Cari sebagian nama atau NIP (tidak peka huruf besar/kecil).',
  })
  @IsOptional()
  @Transform(toSearchTerm)
  @IsString()
  @MaxLength(100, { message: 'search maksimal 100 karakter' })
  search?: string;
}

export class ListAttendancesQueryDto extends IntersectionType(
  AttendanceFilterQueryDto,
  PaginationQueryDto,
) {}
