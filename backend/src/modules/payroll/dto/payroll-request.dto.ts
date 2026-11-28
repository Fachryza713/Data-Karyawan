import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { composePropertyDecorators } from '../../../common/decorators/compose.js';
import { MONEY_EXAMPLE } from '../../../common/money/money.js';
import { trimString } from '../../../common/validation/fields.js';
import {
  IsDateOnly,
  IsMoney,
  IsRate,
  OptionalNonNull,
} from '../../../common/validation/validators.js';
import {
  BenefitStatus,
  PayrollConfigKey,
  PayrollPeriodStatus,
} from '../../../generated/prisma/enums.js';
import {
  BANK_NAME_MAX_LENGTH,
  BENEFIT_CODE_MAX_LENGTH,
  BENEFIT_TEXT_MAX_LENGTH,
  MAX_DEPENDENTS,
  NOTE_MAX_LENGTH,
  PERIOD_PATTERN,
  REASON_MAX_LENGTH,
} from '../payroll.constants.js';

/** Teks di-trim, wajib diisi (bukan spasi), maksimal `max` karakter. */
const TrimmedText = (field: string, max: number) =>
  composePropertyDecorators(
    Transform(trimString),
    IsString({ message: `${field} harus berupa teks` }),
    MinLength(1, { message: `${field} wajib diisi` }),
    MaxLength(max, { message: `${field} maksimal ${max} karakter` }),
  );

const MONEY_DOC = {
  type: String,
  example: MONEY_EXAMPLE,
  pattern: '^(0|[1-9]\\d{0,12})(\\.\\d{1,2})?$',
  description: 'Rupiah sebagai teks (bukan angka JSON), maksimal 2 desimal.',
} as const;

const RATE_DOC = {
  type: String,
  pattern: '^(0(\\.\\d{1,4})?|1(\\.0{1,4})?)$',
  description: 'Tarif pecahan sebagai teks: "0.0100" = 1%. Maksimal 4 desimal.',
} as const;

// ---------------------------------------------------------------------------
// Struktur gaji dan manfaat
// ---------------------------------------------------------------------------

export class CreateSalaryStructureDto {
  @ApiProperty(MONEY_DOC)
  @IsMoney()
  baseSalary: string;

  @ApiPropertyOptional({ ...MONEY_DOC, example: '1000000', default: '0' })
  @OptionalNonNull()
  @IsMoney()
  fixedAllowance?: string;

  @ApiProperty({ example: 'BCA', maxLength: BANK_NAME_MAX_LENGTH })
  @TrimmedText('bankName', BANK_NAME_MAX_LENGTH)
  bankName: string;

  @ApiProperty({
    example: '8821',
    description: 'Hanya 4 digit terakhir nomor rekening.',
  })
  @Matches(/^\d{4}$/, { message: 'bankAccountLast4 harus tepat 4 digit' })
  bankAccountLast4: string;

  @ApiProperty({
    format: 'date',
    example: '2026-12-01',
    description:
      'Mulai berlaku. Payroll memakai struktur dengan effectiveFrom terbaru ' +
      '<= akhir bulan periode.',
  })
  @IsDateOnly()
  effectiveFrom: string;
}

export class CreateBenefitDto {
  @ApiProperty({
    example: 'BPJS Kesehatan',
    maxLength: BENEFIT_TEXT_MAX_LENGTH,
  })
  @TrimmedText('provider', BENEFIT_TEXT_MAX_LENGTH)
  provider: string;

  @ApiPropertyOptional({ example: 'JKN', maxLength: BENEFIT_TEXT_MAX_LENGTH })
  @OptionalNonNull()
  @TrimmedText('program', BENEFIT_TEXT_MAX_LENGTH)
  program?: string;

  @ApiPropertyOptional({
    example: '0001234567890',
    maxLength: BENEFIT_CODE_MAX_LENGTH,
  })
  @OptionalNonNull()
  @TrimmedText('cardNo', BENEFIT_CODE_MAX_LENGTH)
  cardNo?: string;

  @ApiPropertyOptional({
    example: 'Kelas 1',
    maxLength: BENEFIT_CODE_MAX_LENGTH,
  })
  @OptionalNonNull()
  @TrimmedText('class', BENEFIT_CODE_MAX_LENGTH)
  class?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_DEPENDENTS, default: 0 })
  @OptionalNonNull()
  @IsInt({ message: 'dependents harus bilangan bulat' })
  @Min(0, { message: 'dependents minimal 0' })
  @Max(MAX_DEPENDENTS, { message: `dependents maksimal ${MAX_DEPENDENTS}` })
  dependents?: number;

  @ApiPropertyOptional({ enum: BenefitStatus, default: BenefitStatus.ACTIVE })
  @OptionalNonNull()
  @IsEnum(BenefitStatus, { message: 'status harus ACTIVE atau INACTIVE' })
  status?: BenefitStatus;
}

/** Hanya field yang dikirim yang diubah; program/cardNo/class null = dikosongkan. */
export class UpdateBenefitDto {
  @ApiPropertyOptional({ maxLength: BENEFIT_TEXT_MAX_LENGTH })
  @OptionalNonNull()
  @TrimmedText('provider', BENEFIT_TEXT_MAX_LENGTH)
  provider?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @TrimmedText('program', BENEFIT_TEXT_MAX_LENGTH)
  program?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @TrimmedText('cardNo', BENEFIT_CODE_MAX_LENGTH)
  cardNo?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @TrimmedText('class', BENEFIT_CODE_MAX_LENGTH)
  class?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_DEPENDENTS })
  @OptionalNonNull()
  @IsInt({ message: 'dependents harus bilangan bulat' })
  @Min(0, { message: 'dependents minimal 0' })
  @Max(MAX_DEPENDENTS, { message: `dependents maksimal ${MAX_DEPENDENTS}` })
  dependents?: number;

  @ApiPropertyOptional({ enum: BenefitStatus })
  @OptionalNonNull()
  @IsEnum(BenefitStatus, { message: 'status harus ACTIVE atau INACTIVE' })
  status?: BenefitStatus;
}

// ---------------------------------------------------------------------------
// Tarif
// ---------------------------------------------------------------------------

export class PayrollConfigInputDto {
  @ApiProperty({ enum: PayrollConfigKey, example: PayrollConfigKey.JP })
  @IsEnum(PayrollConfigKey, {
    message: `key harus salah satu dari: ${Object.values(PayrollConfigKey).join(', ')}`,
  })
  key: PayrollConfigKey;

  @ApiProperty({ ...RATE_DOC, example: '0.0100' })
  @IsRate()
  employeeRate: string;

  @ApiProperty({ ...RATE_DOC, example: '0.0200' })
  @IsRate()
  employerRate: string;

  @ApiProperty({
    ...MONEY_DOC,
    nullable: true,
    example: '10547400',
    description:
      'Batas atas dasar upah. Wajib dikirim: teks rupiah, atau null untuk tanpa batas.',
  })
  @IsDefined({ message: 'wageCap wajib dikirim (null = tanpa batas)' })
  @ValidateIf((_object: object, value: unknown) => value !== null)
  @IsMoney()
  wageCap: string | null;
}

export class UpdatePayrollConfigsDto {
  @ApiProperty({
    format: 'date',
    example: '2026-03-01',
    description:
      'Tanggal 1 suatu bulan. Berlaku untuk periode yang dimulai sejak tanggal ' +
      'ini; tarif lama tetap tersimpan.',
  })
  @IsDateOnly()
  effectiveFrom: string;

  @ApiProperty({
    type: [PayrollConfigInputDto],
    description: 'Program yang tarifnya berubah (1-5, masing-masing sekali).',
  })
  @IsArray({ message: 'configs harus array' })
  @ArrayMinSize(1, { message: 'configs minimal 1 program' })
  @ArrayMaxSize(5, { message: 'configs maksimal 5 program' })
  @ValidateNested({ each: true })
  @Type(() => PayrollConfigInputDto)
  configs: PayrollConfigInputDto[];
}

export class PayrollConfigQueryDto {
  @ApiPropertyOptional({
    format: 'date',
    description:
      'Tarif yang berlaku pada tanggal ini. Kosong = hari ini (WIB).',
  })
  @IsOptional()
  @IsDateOnly()
  date?: string;
}

// ---------------------------------------------------------------------------
// Periode dan slip
// ---------------------------------------------------------------------------

export class CreatePayrollPeriodDto {
  @ApiProperty({ example: '2026-11', description: 'Bulan YYYY-MM.' })
  @Matches(PERIOD_PATTERN, {
    message: 'period harus berformat YYYY-MM, contoh 2026-11',
  })
  period: string;
}

export class ListPayrollPeriodsQueryDto {
  @ApiPropertyOptional({ enum: PayrollPeriodStatus })
  @IsOptional()
  @IsEnum(PayrollPeriodStatus, {
    message: 'status harus DRAFT, FINAL, atau PAID',
  })
  status?: PayrollPeriodStatus;
}

export class ReopenPayrollPeriodDto {
  @ApiProperty({
    maxLength: REASON_MAX_LENGTH,
    example: 'Koreksi bonus Andika Saputra',
    description: 'Wajib, dicatat di AuditLog.',
  })
  @TrimmedText('reason', REASON_MAX_LENGTH)
  reason: string;
}

/** Isian HR per slip. Hanya field yang dikirim yang diubah; note null = dikosongkan. */
export class UpdatePayrollItemDto {
  @ApiPropertyOptional({ ...MONEY_DOC, example: '1500000' })
  @OptionalNonNull()
  @IsMoney()
  bonus?: string;

  @ApiPropertyOptional({
    ...MONEY_DOC,
    example: '250000',
    description: 'PPh 21 diinput manual oleh HR (PRD 6.4).',
  })
  @OptionalNonNull()
  @IsMoney()
  pph21?: string;

  @ApiPropertyOptional({ ...MONEY_DOC, example: '0' })
  @OptionalNonNull()
  @IsMoney()
  otherDeductions?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: NOTE_MAX_LENGTH,
    example: 'Bonus target Q4',
  })
  @IsOptional()
  @TrimmedText('note', NOTE_MAX_LENGTH)
  note?: string | null;
}
