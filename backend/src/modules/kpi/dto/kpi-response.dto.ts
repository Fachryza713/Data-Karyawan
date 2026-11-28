import { ApiProperty } from '@nestjs/swagger';
import { PageMetaDto } from '../../../common/dto/pagination.dto.js';
import { NamedRefDto } from '../../../common/dto/named-ref.dto.js';
import {
  KpiGrade,
  KpiPeriodStatus,
  KpiReviewStatus,
} from '../../../generated/prisma/enums.js';

const percent = (example: string, nullable = false) =>
  ApiProperty({
    type: String,
    example,
    nullable,
    description: 'Teks desimal (bukan angka JSON).',
  });

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

export class KpiIndicatorResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Ketepatan rilis fitur' })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @percent('33.33')
  weight: string;

  @ApiProperty({ type: String, nullable: true })
  target: string | null;

  @ApiProperty({ example: 0 })
  order: number;
}

export class KpiTemplateResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: NamedRefDto })
  position: NamedRefDto;

  @ApiProperty({ type: NamedRefDto })
  department: NamedRefDto;

  @ApiProperty({ example: 'KPI Frontend Developer 2026' })
  name: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ type: [KpiIndicatorResponseDto] })
  indicators: KpiIndicatorResponseDto[];

  @percent('100.00')
  totalWeight: string;

  @ApiProperty({ description: 'Punya indikator dan total bobot tepat 100' })
  isValid: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Total bobot 90.00, harus 100.00',
  })
  problem: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Periode
// ---------------------------------------------------------------------------

export class KpiPeriodResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Q1 2026' })
  name: string;

  @ApiProperty({ format: 'date', example: '2026-01-01' })
  startDate: string;

  @ApiProperty({ format: 'date', example: '2026-03-31' })
  endDate: string;

  @ApiProperty({ format: 'date', example: '2026-04-15' })
  deadline: string;

  @ApiProperty({ enum: KpiPeriodStatus })
  status: KpiPeriodStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  activatedAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt: string | null;

  @ApiProperty({ description: 'Jumlah penilaian di periode ini' })
  reviewCount: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: string;
}

export class KpiActivationResponseDto {
  @ApiProperty({ type: KpiPeriodResponseDto })
  period: KpiPeriodResponseDto;

  @ApiProperty({
    description: 'Penilaian DRAFT yang dibuat (satu per karyawan aktif)',
  })
  reviewsCreated: number;
}

export class KpiPeriodProgressDto {
  @ApiProperty({ format: 'uuid' })
  periodId: string;

  @ApiProperty({ example: 'Q1 2026' })
  name: string;

  @ApiProperty({ enum: KpiPeriodStatus })
  status: KpiPeriodStatus;

  @ApiProperty({ format: 'date', example: '2026-04-15' })
  deadline: string;

  @ApiProperty({
    description: 'Hari menuju tenggat (WIB); negatif = sudah lewat',
  })
  daysToDeadline: number;

  @ApiProperty({
    description: 'Periode aktif, tenggat lewat, dan masih ada yang belum final',
  })
  isOverdue: boolean;

  @ApiProperty({ example: 128, description: 'Jumlah penilaian' })
  total: number;

  @ApiProperty({ example: 108, description: 'Sudah dinilai (FINAL)' })
  finalized: number;

  @ApiProperty({ example: 20, description: 'Belum final (DRAFT)' })
  remaining: number;

  @ApiProperty({
    example: 84,
    description: 'finalized / total, persen dibulatkan ke bawah',
  })
  percentFinalized: number;

  @percent('82.4', true)
  averageScore: string | null;
}

// ---------------------------------------------------------------------------
// Penilaian
// ---------------------------------------------------------------------------

export class KpiEmployeeRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'BRT-2024-0003' })
  nip: string;

  @ApiProperty({ example: 'Raditya Pratama' })
  fullName: string;
}

export class KpiReviewSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: NamedRefDto, description: 'Periode' })
  period: NamedRefDto;

  @ApiProperty({ type: KpiEmployeeRefDto })
  employee: KpiEmployeeRefDto;

  @ApiProperty({
    type: NamedRefDto,
    nullable: true,
    description: 'Jabatan saat periode diaktifkan',
  })
  position: NamedRefDto | null;

  @ApiProperty({
    type: NamedRefDto,
    nullable: true,
    description: 'Departemen saat periode diaktifkan',
  })
  department: NamedRefDto | null;

  @ApiProperty({
    type: NamedRefDto,
    nullable: true,
    description: 'HR terakhir yang menyimpan skor/memfinalkan',
  })
  reviewer: NamedRefDto | null;

  @ApiProperty({ enum: KpiReviewStatus })
  status: KpiReviewStatus;

  @percent('82.4', true)
  finalScore: string | null;

  @ApiProperty({ enum: KpiGrade, nullable: true })
  grade: KpiGrade | null;

  @ApiProperty({ example: 4, description: 'Indikator yang sudah diberi skor' })
  scoredCount: number;

  @ApiProperty({ example: 4 })
  indicatorCount: number;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finalizedAt: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: string;
}

export class KpiScoreResponseDto {
  @ApiProperty({ format: 'uuid' })
  indicatorId: string;

  @ApiProperty({ description: 'Snapshot nama indikator saat aktivasi' })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @percent('25.00')
  weight: string;

  @ApiProperty({ type: String, nullable: true })
  target: string | null;

  @ApiProperty()
  order: number;

  @percent('87.50', true)
  score: string | null;

  @ApiProperty({ type: String, nullable: true })
  note: string | null;
}

export class KpiResultPreviewDto {
  @percent('82.4')
  finalScore: string;

  @ApiProperty({ enum: KpiGrade })
  grade: KpiGrade;
}

export class KpiReviewDetailDto extends KpiReviewSummaryDto {
  @ApiProperty({ type: String, nullable: true })
  note: string | null;

  @ApiProperty({
    type: NamedRefDto,
    nullable: true,
    description: 'Template yang disalin saat aktivasi',
  })
  template: NamedRefDto | null;

  @ApiProperty({ type: [KpiScoreResponseDto] })
  scores: KpiScoreResponseDto[];

  @ApiProperty({
    type: KpiResultPreviewDto,
    nullable: true,
    description:
      'Perkiraan nilai akhir dan grade dari skor yang tersimpan (null jika belum lengkap). Untuk FINAL sama dengan finalScore/grade.',
  })
  preview: KpiResultPreviewDto | null;
}

export class KpiReviewListResponseDto {
  @ApiProperty({ type: [KpiReviewSummaryDto] })
  data: KpiReviewSummaryDto[];

  @ApiProperty({ type: PageMetaDto })
  meta: PageMetaDto;
}
