import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';
import { composePropertyDecorators } from '../../../common/decorators/compose.js';
import {
  MASTER_NAME_MAX_LENGTH,
  NameField,
} from '../../../common/validation/fields.js';
import { TIME_HHMM_PATTERN } from '../../../common/validation/formats.js';
import { OptionalNonNull } from '../../../common/validation/validators.js';
import { LATE_TOLERANCE_MAX_MIN } from '../settings.constants.js';

// Format jam dicek di sini; aturan "jam pulang setelah jam masuk" dicek di
// ShiftsService karena PATCH bisa mengirim salah satu jam saja.

const TimeField = () =>
  composePropertyDecorators(
    IsString({ message: '$property harus berupa teks' }),
    Matches(TIME_HHMM_PATTERN, {
      message: '$property harus berformat HH:mm (00:00-23:59), contoh 08:30',
    }),
  );

const LateToleranceField = () =>
  composePropertyDecorators(
    IsInt({ message: 'lateToleranceMin harus bilangan bulat (menit)' }),
    Min(0, { message: 'lateToleranceMin minimal 0 menit' }),
    Max(LATE_TOLERANCE_MAX_MIN, {
      message: `lateToleranceMin maksimal ${LATE_TOLERANCE_MAX_MIN} menit`,
    }),
  );

const TIME_NOTE = 'Jam WIB, format HH:mm.';

export class CreateShiftDto {
  @ApiProperty({ example: 'Reguler', maxLength: MASTER_NAME_MAX_LENGTH })
  @NameField()
  name: string;

  @ApiProperty({
    example: '08:30',
    pattern: TIME_HHMM_PATTERN.source,
    description: TIME_NOTE,
  })
  @TimeField()
  startTime: string;

  @ApiProperty({
    example: '17:30',
    pattern: TIME_HHMM_PATTERN.source,
    description: `${TIME_NOTE} Harus setelah startTime.`,
  })
  @TimeField()
  endTime: string;

  @ApiPropertyOptional({
    example: 15,
    minimum: 0,
    maximum: LATE_TOLERANCE_MAX_MIN,
    default: 15,
    description: 'Menit setelah startTime yang masih dihitung tepat waktu.',
  })
  @OptionalNonNull()
  @LateToleranceField()
  lateToleranceMin?: number;
}

export class UpdateShiftDto {
  @ApiPropertyOptional({
    example: 'Reguler',
    maxLength: MASTER_NAME_MAX_LENGTH,
  })
  @OptionalNonNull()
  @NameField()
  name?: string;

  @ApiPropertyOptional({
    example: '08:00',
    pattern: TIME_HHMM_PATTERN.source,
    description: TIME_NOTE,
  })
  @OptionalNonNull()
  @TimeField()
  startTime?: string;

  @ApiPropertyOptional({
    example: '17:00',
    pattern: TIME_HHMM_PATTERN.source,
    description: `${TIME_NOTE} Harus setelah startTime (baru atau lama).`,
  })
  @OptionalNonNull()
  @TimeField()
  endTime?: string;

  @ApiPropertyOptional({
    example: 10,
    minimum: 0,
    maximum: LATE_TOLERANCE_MAX_MIN,
  })
  @OptionalNonNull()
  @LateToleranceField()
  lateToleranceMin?: number;
}

export class ShiftResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Reguler' })
  name: string;

  @ApiProperty({ example: '08:30' })
  startTime: string;

  @ApiProperty({ example: '17:30' })
  endTime: string;

  @ApiProperty({ example: 15 })
  lateToleranceMin: number;

  @ApiProperty({ example: 25, description: 'Jumlah karyawan aktif.' })
  employeeCount: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}
