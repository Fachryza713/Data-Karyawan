import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { composePropertyDecorators } from '../../../common/decorators/compose.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { trimString } from '../../../common/validation/fields.js';
import {
  IsDateOnly,
  OptionalNonNull,
} from '../../../common/validation/validators.js';
import {
  KpiPeriodStatus,
  KpiReviewStatus,
} from '../../../generated/prisma/enums.js';
import {
  KPI_DESCRIPTION_MAX_LENGTH,
  KPI_NAME_MAX_LENGTH,
  KPI_PERIOD_NAME_MAX_LENGTH,
  KPI_REVIEW_NOTE_MAX_LENGTH,
  KPI_SCORE_NOTE_MAX_LENGTH,
  KPI_TARGET_MAX_LENGTH,
  MAX_INDICATOR_ORDER,
  MAX_INDICATORS_PER_TEMPLATE,
  PERCENT_PATTERN,
} from '../kpi.constants.js';

/** Teks di-trim, wajib diisi, maksimal `max` karakter. */
const RequiredText = (field: string, max: number) =>
  composePropertyDecorators(
    Transform(trimString),
    IsString({ message: `${field} harus berupa teks` }),
    MinLength(1, { message: `${field} wajib diisi` }),
    MaxLength(max, { message: `${field} maksimal ${max} karakter` }),
  );

/** Teks opsional: di-trim, teks kosong menjadi null, maksimal `max` karakter. */
const OptionalText = (field: string, max: number) =>
  composePropertyDecorators(
    Transform(({ value }: { value: unknown }) => {
      const trimmed = trimString({ value });
      return trimmed === '' ? null : trimmed;
    }),
    IsOptional(),
    IsString({ message: `${field} harus berupa teks` }),
    MaxLength(max, { message: `${field} maksimal ${max} karakter` }),
  );

/** Persen 0-100 sebagai teks (bukan angka JSON), maksimal 2 desimal. */
const Percent = (field: string) =>
  composePropertyDecorators(
    IsString({ message: `${field} harus berupa teks, contoh "33.33"` }),
    Matches(PERCENT_PATTERN, {
      message: `${field} harus angka 0-100 berupa teks dengan maksimal 2 desimal, contoh "33.33"`,
    }),
  );

const PERCENT_DOC = {
  type: String,
  pattern: PERCENT_PATTERN.source,
  description: 'Teks desimal 0-100, maksimal 2 desimal (bukan angka JSON).',
} as const;

const DATE_DOC = { format: 'date', example: '2026-01-01' } as const;

// ---------------------------------------------------------------------------
// Template dan indikator
// ---------------------------------------------------------------------------

export class CreateKpiIndicatorDto {
  @ApiProperty({
    example: 'Ketepatan rilis fitur',
    maxLength: KPI_NAME_MAX_LENGTH,
  })
  @RequiredText('name', KPI_NAME_MAX_LENGTH)
  name: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: KPI_DESCRIPTION_MAX_LENGTH,
  })
  @OptionalText('description', KPI_DESCRIPTION_MAX_LENGTH)
  description?: string | null;

  @ApiProperty({
    ...PERCENT_DOC,
    example: '33.33',
    description:
      'Bobot dalam persen, > 0. Total bobot satu template harus 100.',
  })
  @Percent('weight')
  weight: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '>= 90% sprint selesai tepat waktu',
    maxLength: KPI_TARGET_MAX_LENGTH,
  })
  @OptionalText('target', KPI_TARGET_MAX_LENGTH)
  target?: string | null;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: MAX_INDICATOR_ORDER,
    description: 'Urutan tampil. Default: setelah indikator terakhir.',
  })
  @OptionalNonNull()
  @IsInt({ message: 'order harus bilangan bulat' })
  @Min(0, { message: 'order minimal 0' })
  @Max(MAX_INDICATOR_ORDER, {
    message: `order maksimal ${MAX_INDICATOR_ORDER}`,
  })
  order?: number;
}

/** Hanya field yang dikirim yang diubah; description/target null = dikosongkan. */
export class UpdateKpiIndicatorDto {
  @ApiPropertyOptional({ maxLength: KPI_NAME_MAX_LENGTH })
  @OptionalNonNull()
  @RequiredText('name', KPI_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: KPI_DESCRIPTION_MAX_LENGTH,
  })
  @OptionalText('description', KPI_DESCRIPTION_MAX_LENGTH)
  description?: string | null;

  @ApiPropertyOptional({ ...PERCENT_DOC, example: '40' })
  @OptionalNonNull()
  @Percent('weight')
  weight?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: KPI_TARGET_MAX_LENGTH,
  })
  @OptionalText('target', KPI_TARGET_MAX_LENGTH)
  target?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_INDICATOR_ORDER })
  @OptionalNonNull()
  @IsInt({ message: 'order harus bilangan bulat' })
  @Min(0, { message: 'order minimal 0' })
  @Max(MAX_INDICATOR_ORDER, {
    message: `order maksimal ${MAX_INDICATOR_ORDER}`,
  })
  order?: number;
}

export class CreateKpiTemplateDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'positionId harus UUID' })
  positionId: string;

  @ApiProperty({
    example: 'KPI Frontend Developer 2026',
    maxLength: KPI_NAME_MAX_LENGTH,
  })
  @RequiredText('name', KPI_NAME_MAX_LENGTH)
  name: string;

  @ApiPropertyOptional({
    default: true,
    description:
      'true = menjadi template aktif jabatan ini; template aktif sebelumnya ' +
      'otomatis dinonaktifkan (satu template aktif per jabatan).',
  })
  @OptionalNonNull()
  @IsBoolean({ message: 'isActive harus boolean' })
  isActive?: boolean;

  @ApiPropertyOptional({
    type: [CreateKpiIndicatorDto],
    maxItems: MAX_INDICATORS_PER_TEMPLATE,
    description: 'Indikator awal (boleh kosong, ditambah kemudian).',
  })
  @OptionalNonNull()
  @IsArray({ message: 'indicators harus array' })
  @ArrayMaxSize(MAX_INDICATORS_PER_TEMPLATE, {
    message: `indicators maksimal ${MAX_INDICATORS_PER_TEMPLATE} item`,
  })
  @ValidateNested({ each: true })
  @Type(() => CreateKpiIndicatorDto)
  indicators?: CreateKpiIndicatorDto[];
}

export class UpdateKpiTemplateDto {
  @ApiPropertyOptional({ maxLength: KPI_NAME_MAX_LENGTH })
  @OptionalNonNull()
  @RequiredText('name', KPI_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({
    description:
      'true = jadikan template aktif jabatannya (template aktif lain ' +
      'dinonaktifkan); false = nonaktifkan.',
  })
  @OptionalNonNull()
  @IsBoolean({ message: 'isActive harus boolean' })
  isActive?: boolean;
}

export class CopyKpiTemplateDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Jabatan yang template aktifnya disalin',
  })
  @IsUUID('all', { message: 'fromPositionId harus UUID' })
  fromPositionId: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'Jabatan tujuan. Salinan menjadi template aktifnya (template aktif lama dinonaktifkan).',
  })
  @IsUUID('all', { message: 'toPositionId harus UUID' })
  toPositionId: string;

  @ApiPropertyOptional({
    maxLength: KPI_NAME_MAX_LENGTH,
    description: 'Default: "<nama template sumber> (salinan)".',
  })
  @OptionalNonNull()
  @RequiredText('name', KPI_NAME_MAX_LENGTH)
  name?: string;
}

export class ListKpiTemplatesQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'positionId harus UUID' })
  positionId?: string;

  @ApiPropertyOptional({ description: 'true = hanya template aktif' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'isActive harus true atau false' })
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// Periode
// ---------------------------------------------------------------------------

export class CreateKpiPeriodDto {
  @ApiProperty({ example: 'Q1 2026', maxLength: KPI_PERIOD_NAME_MAX_LENGTH })
  @RequiredText('name', KPI_PERIOD_NAME_MAX_LENGTH)
  name: string;

  @ApiProperty(DATE_DOC)
  @IsDateOnly()
  startDate: string;

  @ApiProperty({ ...DATE_DOC, example: '2026-03-31' })
  @IsDateOnly()
  endDate: string;

  @ApiProperty({
    ...DATE_DOC,
    example: '2026-04-15',
    description: 'Tenggat pengisian penilaian, tidak sebelum startDate.',
  })
  @IsDateOnly()
  deadline: string;
}

/** DRAFT: semua field. ACTIVE: hanya deadline. CLOSED: tidak bisa diubah. */
export class UpdateKpiPeriodDto {
  @ApiPropertyOptional({ maxLength: KPI_PERIOD_NAME_MAX_LENGTH })
  @OptionalNonNull()
  @RequiredText('name', KPI_PERIOD_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional(DATE_DOC)
  @OptionalNonNull()
  @IsDateOnly()
  startDate?: string;

  @ApiPropertyOptional(DATE_DOC)
  @OptionalNonNull()
  @IsDateOnly()
  endDate?: string;

  @ApiPropertyOptional(DATE_DOC)
  @OptionalNonNull()
  @IsDateOnly()
  deadline?: string;
}

export class ListKpiPeriodsQueryDto {
  @ApiPropertyOptional({ enum: KpiPeriodStatus })
  @IsOptional()
  @IsEnum(KpiPeriodStatus, {
    message: 'status harus DRAFT, ACTIVE, atau CLOSED',
  })
  status?: KpiPeriodStatus;
}

// ---------------------------------------------------------------------------
// Penilaian
// ---------------------------------------------------------------------------

export class KpiScoreInputDto {
  @ApiProperty({
    format: 'uuid',
    description: 'indicatorId dari detail penilaian',
  })
  @IsUUID('all', { message: 'indicatorId harus UUID' })
  indicatorId: string;

  @ApiProperty({ ...PERCENT_DOC, example: '87.5', description: 'Skor 0-100.' })
  @Percent('score')
  score: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: KPI_SCORE_NOTE_MAX_LENGTH,
  })
  @OptionalText('note', KPI_SCORE_NOTE_MAX_LENGTH)
  note?: string | null;
}

/** Menimpa semua skor dan catatan penilaian DRAFT (catatan tidak dikirim = dikosongkan). */
export class SaveKpiScoresDto {
  @ApiProperty({
    type: [KpiScoreInputDto],
    description: 'Tepat satu skor untuk setiap indikator penilaian.',
  })
  @IsArray({ message: 'scores harus array' })
  @ArrayMinSize(1, { message: 'scores wajib diisi' })
  @ArrayMaxSize(MAX_INDICATORS_PER_TEMPLATE, {
    message: `scores maksimal ${MAX_INDICATORS_PER_TEMPLATE} item`,
  })
  @ValidateNested({ each: true })
  @Type(() => KpiScoreInputDto)
  scores: KpiScoreInputDto[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: KPI_REVIEW_NOTE_MAX_LENGTH,
  })
  @OptionalText('note', KPI_REVIEW_NOTE_MAX_LENGTH)
  note?: string | null;
}

export class ListKpiReviewsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'periodId harus UUID' })
  periodId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Departemen karyawan saat periode diaktifkan',
  })
  @IsOptional()
  @IsUUID('all', { message: 'departmentId harus UUID' })
  departmentId?: string;

  @ApiPropertyOptional({ enum: KpiReviewStatus })
  @IsOptional()
  @IsEnum(KpiReviewStatus, { message: 'status harus DRAFT atau FINAL' })
  status?: KpiReviewStatus;
}
