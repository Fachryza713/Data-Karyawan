import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, Max, Min } from 'class-validator';
import { composePropertyDecorators } from '../../../common/decorators/compose.js';
import {
  MASTER_NAME_MAX_LENGTH,
  NameField,
} from '../../../common/validation/fields.js';
import { OptionalNonNull } from '../../../common/validation/validators.js';
import {
  COORDINATE_DECIMAL_PLACES,
  RADIUS_MAX_M,
  RADIUS_MIN_M,
} from '../settings.constants.js';

const CoordinateField = (name: string, limit: number) =>
  composePropertyDecorators(
    IsNumber(
      { allowNaN: false, allowInfinity: false },
      { message: `${name} harus berupa angka` },
    ),
    Min(-limit, { message: `${name} minimal -${limit}` }),
    Max(limit, { message: `${name} maksimal ${limit}` }),
  );

const RadiusField = () =>
  composePropertyDecorators(
    IsInt({ message: 'radiusM harus bilangan bulat (meter)' }),
    Min(RADIUS_MIN_M, { message: `radiusM minimal ${RADIUS_MIN_M} meter` }),
    Max(RADIUS_MAX_M, { message: `radiusM maksimal ${RADIUS_MAX_M} meter` }),
  );

const COORDINATE_NOTE = `Dibulatkan ke ${COORDINATE_DECIMAL_PLACES} angka di belakang koma.`;

export class CreateOfficeLocationDto {
  @ApiProperty({
    example: 'Head Office Jakarta',
    maxLength: MASTER_NAME_MAX_LENGTH,
  })
  @NameField()
  name: string;

  @ApiProperty({
    example: -6.224889,
    minimum: -90,
    maximum: 90,
    description: COORDINATE_NOTE,
  })
  @CoordinateField('latitude', 90)
  latitude: number;

  @ApiProperty({
    example: 106.809889,
    minimum: -180,
    maximum: 180,
    description: COORDINATE_NOTE,
  })
  @CoordinateField('longitude', 180)
  longitude: number;

  @ApiPropertyOptional({
    example: 100,
    minimum: RADIUS_MIN_M,
    maximum: RADIUS_MAX_M,
    default: 100,
    description: 'Radius presensi dari titik kantor (meter).',
  })
  @OptionalNonNull()
  @RadiusField()
  radiusM?: number;
}

export class UpdateOfficeLocationDto {
  @ApiPropertyOptional({
    example: 'Head Office Jakarta',
    maxLength: MASTER_NAME_MAX_LENGTH,
  })
  @OptionalNonNull()
  @NameField()
  name?: string;

  @ApiPropertyOptional({
    example: -6.224889,
    minimum: -90,
    maximum: 90,
    description: COORDINATE_NOTE,
  })
  @OptionalNonNull()
  @CoordinateField('latitude', 90)
  latitude?: number;

  @ApiPropertyOptional({
    example: 106.809889,
    minimum: -180,
    maximum: 180,
    description: COORDINATE_NOTE,
  })
  @OptionalNonNull()
  @CoordinateField('longitude', 180)
  longitude?: number;

  @ApiPropertyOptional({
    example: 150,
    minimum: RADIUS_MIN_M,
    maximum: RADIUS_MAX_M,
  })
  @OptionalNonNull()
  @RadiusField()
  radiusM?: number;
}

export class OfficeLocationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Head Office Jakarta' })
  name: string;

  @ApiProperty({ example: -6.224889 })
  latitude: number;

  @ApiProperty({ example: 106.809889 })
  longitude: number;

  @ApiProperty({ example: 100 })
  radiusM: number;

  @ApiProperty({ example: 25, description: 'Jumlah karyawan aktif.' })
  employeeCount: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}
