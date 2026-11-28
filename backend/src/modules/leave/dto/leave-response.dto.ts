import { ApiProperty } from '@nestjs/swagger';
import { NamedRefDto } from '../../../common/dto/named-ref.dto.js';
import { PageMetaDto } from '../../../common/dto/pagination.dto.js';
import {
  LeaveRequestKind,
  LeaveRequestStatus,
} from '../../../generated/prisma/enums.js';

export class LeaveTypeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'ANNUAL' })
  code: string;

  @ApiProperty({ example: 'Cuti tahunan' })
  name: string;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    example: 12,
    description: 'Hari kerja per tahun. Null = tidak terbatas.',
  })
  annualQuota: number | null;

  @ApiProperty({ example: true })
  deductsQuota: boolean;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    example: null,
    description:
      'Lampiran wajib jika hari kerja lebih dari nilai ini. Null = opsional.',
  })
  attachmentRequiredAfterDays: number | null;
}

export class LeaveTypeRefDto extends NamedRefDto {
  @ApiProperty({ example: 'ANNUAL' })
  code: string;
}

export class ReviewerDto {
  @ApiProperty({ format: 'uuid', description: 'ID akun (user) HR.' })
  id: string;

  @ApiProperty({ example: 'Dian Puspitasari' })
  name: string;
}

/** Pengajuan dari sudut pandang pemiliknya. */
export class LeaveRequestResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: LeaveRequestKind })
  kind: LeaveRequestKind;

  @ApiProperty({ type: LeaveTypeRefDto, nullable: true })
  leaveType: LeaveTypeRefDto | null;

  @ApiProperty({ format: 'date', example: '2026-12-07' })
  startDate: string;

  @ApiProperty({ format: 'date', example: '2026-12-09' })
  endDate: string;

  @ApiProperty({
    example: 3,
    description: 'Hari kerja (tanpa akhir pekan dan libur).',
  })
  workingDays: number;

  @ApiProperty({ example: 'Acara keluarga' })
  reason: string;

  @ApiProperty({ type: 'string', nullable: true, example: null })
  destination: string | null;

  @ApiProperty({ example: false })
  hasAttachment: boolean;

  @ApiProperty({ enum: LeaveRequestStatus })
  status: LeaveRequestStatus;

  @ApiProperty({ type: ReviewerDto, nullable: true })
  reviewedBy: ReviewerDto | null;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  reviewedAt: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  reviewNote: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class LeaveRequesterDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'BRT-2024-0003' })
  nip: string;

  @ApiProperty({ example: 'Raditya Pratama' })
  fullName: string;

  @ApiProperty({ type: NamedRefDto })
  department: NamedRefDto;
}

/** Pengajuan di daftar HR: ditambah data karyawan pengaju. */
export class HrLeaveRequestResponseDto extends LeaveRequestResponseDto {
  @ApiProperty({ type: LeaveRequesterDto })
  employee: LeaveRequesterDto;
}

export class LeaveBalanceResponseDto {
  @ApiProperty({ example: 2026 })
  year: number;

  @ApiProperty({ example: 12 })
  quota: number;

  @ApiProperty({ example: 4 })
  used: number;

  @ApiProperty({ example: 8, description: 'quota - used' })
  remaining: number;

  @ApiProperty({
    example: 2,
    description:
      'Hari kerja cuti tahunan yang masih menunggu persetujuan. Belum ' +
      'memotong saldo; approve ditolak jika saldo tidak cukup.',
  })
  pendingDays: number;
}

export class AttachmentLinkDto {
  @ApiProperty({ description: 'Presigned GET URL, berlaku 5 menit.' })
  url: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;
}

export class LeaveRequestDetailResponseDto extends HrLeaveRequestResponseDto {
  @ApiProperty({ type: AttachmentLinkDto, nullable: true })
  attachment: AttachmentLinkDto | null;

  @ApiProperty({
    type: LeaveBalanceResponseDto,
    nullable: true,
    description:
      'Saldo tahun pengajuan, hanya untuk jenis yang mengurangi kuota.',
  })
  balance: LeaveBalanceResponseDto | null;
}

export class MyLeaveRequestPageDto {
  @ApiProperty({ type: [LeaveRequestResponseDto] })
  data: LeaveRequestResponseDto[];

  @ApiProperty({ type: PageMetaDto })
  meta: PageMetaDto;
}

export class HrLeaveRequestPageDto {
  @ApiProperty({ type: [HrLeaveRequestResponseDto] })
  data: HrLeaveRequestResponseDto[];

  @ApiProperty({ type: PageMetaDto })
  meta: PageMetaDto;
}

export class AttachmentUploadUrlResponseDto {
  @ApiProperty({ example: 'leave/0196.../1b4e...' })
  key: string;

  @ApiProperty({ enum: ['POST'], description: 'Method upload ke storage.' })
  method: 'POST';

  @ApiProperty({ example: 'http://localhost:9000/hris-files' })
  url: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'Kirim semua field ini sebagai multipart/form-data ke url, lalu field ' +
      '"file" berisi lampiran (harus paling akhir).',
  })
  fields: Record<string, string>;

  @ApiProperty({ example: 2097152 })
  maxBytes: number;

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;
}
