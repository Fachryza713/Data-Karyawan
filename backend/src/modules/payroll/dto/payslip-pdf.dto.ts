import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import {
  PayrollPeriodStatus,
  SlipStatus,
} from '../../../generated/prisma/enums.js';
import {
  PAYSLIP_PDF_URL_TTL_SECONDS,
  RegenerateScope,
} from '../payroll.constants.js';

const SCOPES = Object.values(RegenerateScope);

export class RegeneratePayslipsDto {
  @ApiPropertyOptional({
    enum: SCOPES,
    default: RegenerateScope.FAILED,
    description:
      'FAILED = hanya slip yang gagal dibuat. ALL = semua slip periode ' +
      '(PDF yang sudah ada ditimpa; email hanya untuk slip yang belum pernah READY).',
  })
  @IsOptional()
  @IsIn(SCOPES, { message: 'scope harus FAILED atau ALL' })
  scope: RegenerateScope = RegenerateScope.FAILED;
}

export class RegeneratePayslipsResponseDto {
  @ApiProperty({ format: 'uuid' })
  periodId: string;

  @ApiProperty({ enum: SCOPES })
  scope: RegenerateScope;

  @ApiProperty({ description: 'Jumlah slip yang dimasukkan ke antrean' })
  queued: number;
}

export class SlipStatusCountsDto {
  @ApiProperty({ description: 'Belum diminta (mis. periode lama)' })
  NONE: number;

  @ApiProperty({ description: 'Menunggu atau sedang dibuat worker' })
  QUEUED: number;

  @ApiProperty({ description: 'PDF tersedia' })
  READY: number;

  @ApiProperty({ description: 'Gagal setelah semua percobaan' })
  FAILED: number;
}

export class FailedPayslipDto {
  @ApiProperty({ format: 'uuid' })
  itemId: string;

  @ApiProperty({ format: 'uuid' })
  employeeId: string;

  @ApiProperty({ example: 'BRT-2024-0003' })
  nip: string;

  @ApiProperty({ example: 'Raditya Pratama' })
  employeeName: string;

  @ApiProperty({ type: String, nullable: true })
  error: string | null;
}

export class PayslipGenerationStatusDto {
  @ApiProperty({ format: 'uuid' })
  periodId: string;

  @ApiProperty({ example: '2026-11' })
  period: string;

  @ApiProperty({ enum: PayrollPeriodStatus })
  status: PayrollPeriodStatus;

  @ApiProperty({ description: 'Jumlah slip di periode' })
  total: number;

  @ApiProperty({ type: SlipStatusCountsDto })
  counts: SlipStatusCountsDto;

  @ApiProperty({ type: [FailedPayslipDto] })
  failed: FailedPayslipDto[];
}

export class PayslipPdfUrlDto {
  @ApiProperty({ enum: [SlipStatus.READY] })
  status: typeof SlipStatus.READY;

  @ApiProperty({
    description: `Presigned URL PDF, berlaku ${PAYSLIP_PDF_URL_TTL_SECONDS / 60} menit`,
  })
  url: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt: string;
}

export class PayslipPdfPendingDto {
  @ApiProperty({ enum: [SlipStatus.QUEUED] })
  status: typeof SlipStatus.QUEUED;

  @ApiProperty({ example: 'Slip PDF sedang dibuat. Coba lagi beberapa saat.' })
  message: string;
}
