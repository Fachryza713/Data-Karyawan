import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { composePropertyDecorators } from '../../../common/decorators/compose.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { trimString } from '../../../common/validation/fields.js';
import {
  IsDateOnly,
  OptionalNonNull,
} from '../../../common/validation/validators.js';
import {
  LeaveRequestKind,
  LeaveRequestStatus,
} from '../../../generated/prisma/enums.js';
import {
  ATTACHMENT_KEY_MAX_LENGTH,
  DESTINATION_MAX_LENGTH,
  REASON_MAX_LENGTH,
  REVIEW_NOTE_MAX_LENGTH,
} from '../leave.constants.js';

const KINDS = Object.values(LeaveRequestKind).join(', ');
const STATUSES = Object.values(LeaveRequestStatus).join(', ');

/** Teks di-trim, wajib diisi, maksimal `max` karakter. */
const TrimmedText = (field: string, max: number) =>
  composePropertyDecorators(
    Transform(trimString),
    IsString({ message: `${field} harus berupa teks` }),
    MinLength(1, { message: `${field} wajib diisi` }),
    MaxLength(max, { message: `${field} maksimal ${max} karakter` }),
  );

/**
 * Body pengajuan. Hanya bentuk dan format yang dicek di sini; aturan bisnis
 * (H-1, kuota, lampiran, tumpang tindih, field per kind) di service.
 * Karyawan selalu dari JWT, tidak ada employeeId di body.
 */
export class CreateLeaveRequestDto {
  @ApiProperty({ enum: LeaveRequestKind, example: LeaveRequestKind.LEAVE })
  @IsEnum(LeaveRequestKind, { message: `kind harus salah satu dari: ${KINDS}` })
  kind: LeaveRequestKind;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Wajib untuk kind LEAVE, dilarang untuk WFH/BUSINESS_TRIP. Daftar: GET /leave-types.',
  })
  @OptionalNonNull()
  @IsUUID('all', { message: 'leaveTypeId harus UUID' })
  leaveTypeId?: string;

  @ApiProperty({ format: 'date', example: '2026-12-07' })
  @IsDateOnly()
  startDate: string;

  @ApiProperty({ format: 'date', example: '2026-12-09' })
  @IsDateOnly()
  endDate: string;

  @ApiProperty({ maxLength: REASON_MAX_LENGTH, example: 'Acara keluarga' })
  @TrimmedText('reason', REASON_MAX_LENGTH)
  reason: string;

  @ApiPropertyOptional({
    maxLength: DESTINATION_MAX_LENGTH,
    example: 'Surabaya',
    description: 'Wajib untuk BUSINESS_TRIP, dilarang untuk kind lain.',
  })
  @OptionalNonNull()
  @TrimmedText('destination', DESTINATION_MAX_LENGTH)
  destination?: string;

  @ApiPropertyOptional({
    example: 'leave/0196.../1b4e...',
    description:
      'key dari POST /leave-requests/me/attachments/upload-url (hanya kind LEAVE). ' +
      'Wajib untuk sakit lebih dari 1 hari kerja.',
  })
  @OptionalNonNull()
  @IsString({ message: 'attachmentKey harus berupa teks' })
  @MaxLength(ATTACHMENT_KEY_MAX_LENGTH)
  attachmentKey?: string;
}

export class AttachmentUploadUrlDto {
  @ApiProperty({
    example: 'application/pdf',
    description: 'image/jpeg, image/png, atau application/pdf',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString({ message: 'contentType harus berupa teks' })
  @MaxLength(100)
  contentType: string;

  @ApiProperty({
    example: 184320,
    description: 'Ukuran file dalam byte (maks 2 MB).',
  })
  @IsInt({ message: 'size harus bilangan bulat (byte)' })
  @Min(1, { message: 'size minimal 1 byte' })
  size: number;
}

export class ListMyLeaveRequestsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LeaveRequestStatus })
  @IsOptional()
  @IsEnum(LeaveRequestStatus, {
    message: `status harus salah satu dari: ${STATUSES}`,
  })
  status?: LeaveRequestStatus;

  @ApiPropertyOptional({ enum: LeaveRequestKind })
  @IsOptional()
  @IsEnum(LeaveRequestKind, { message: `kind harus salah satu dari: ${KINDS}` })
  kind?: LeaveRequestKind;
}

export class ListLeaveRequestsQueryDto extends ListMyLeaveRequestsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'departmentId harus UUID' })
  departmentId?: string;

  @ApiPropertyOptional({
    format: 'date',
    example: '2026-12-01',
    description:
      'Pengajuan yang rentangnya beririsan dengan from-to (inklusif).',
  })
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-12-31' })
  @IsOptional()
  @IsDateOnly()
  to?: string;
}

export class ApproveLeaveRequestDto {
  @ApiPropertyOptional({
    maxLength: REVIEW_NOTE_MAX_LENGTH,
    example: 'Disetujui, serah terima ke Budi',
  })
  @OptionalNonNull()
  @TrimmedText('note', REVIEW_NOTE_MAX_LENGTH)
  note?: string;
}

export class RejectLeaveRequestDto {
  @ApiProperty({
    maxLength: REVIEW_NOTE_MAX_LENGTH,
    example: 'Bentrok dengan jadwal rilis',
    description: 'Wajib: alasan penolakan untuk karyawan.',
  })
  @TrimmedText('note', REVIEW_NOTE_MAX_LENGTH)
  note: string;
}

export class LeaveBalanceQueryDto {
  @ApiPropertyOptional({
    example: 2026,
    description: 'Tahun kalender. Kosong = tahun ini (WIB).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'year harus bilangan bulat' })
  @Min(2000, { message: 'year minimal 2000' })
  @Max(2100, { message: 'year maksimal 2100' })
  year?: number;
}
