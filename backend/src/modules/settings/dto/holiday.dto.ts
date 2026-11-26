import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  MASTER_NAME_MAX_LENGTH,
  NameField,
} from '../../../common/validation/fields.js';
import { IsDateOnly } from '../../../common/validation/validators.js';
import { HOLIDAY_YEAR_MAX, HOLIDAY_YEAR_MIN } from '../settings.constants.js';

export class ListHolidaysQueryDto {
  @ApiPropertyOptional({
    example: 2026,
    minimum: HOLIDAY_YEAR_MIN,
    maximum: HOLIDAY_YEAR_MAX,
    description: 'Hanya hari libur di tahun ini. Kosong = semua tahun.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'year harus bilangan bulat' })
  @Min(HOLIDAY_YEAR_MIN, { message: `year minimal ${HOLIDAY_YEAR_MIN}` })
  @Max(HOLIDAY_YEAR_MAX, { message: `year maksimal ${HOLIDAY_YEAR_MAX}` })
  year?: number;
}

export class CreateHolidayDto {
  @ApiProperty({
    example: '2026-08-17',
    format: 'date',
    description: 'Unik: satu tanggal hanya satu hari libur.',
  })
  @IsDateOnly()
  date: string;

  @ApiProperty({
    example: 'Hari Kemerdekaan Republik Indonesia',
    maxLength: MASTER_NAME_MAX_LENGTH,
  })
  @NameField()
  name: string;
}

export class HolidayResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '2026-08-17', format: 'date' })
  date: string;

  @ApiProperty({ example: 'Hari Kemerdekaan Republik Indonesia' })
  name: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}
