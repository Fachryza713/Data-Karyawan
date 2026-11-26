import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { NamedRefDto } from '../../../common/dto/named-ref.dto.js';
import {
  MASTER_NAME_MAX_LENGTH,
  NameField,
} from '../../../common/validation/fields.js';
import { OptionalNonNull } from '../../../common/validation/validators.js';

const UuidField = () => IsUUID('all', { message: '$property harus UUID' });

// ---------------------------------------------------------------------------
// Departemen
// ---------------------------------------------------------------------------

export class CreateDepartmentDto {
  @ApiProperty({
    example: 'Teknologi Informasi',
    maxLength: MASTER_NAME_MAX_LENGTH,
  })
  @NameField()
  name: string;
}

export class UpdateDepartmentDto {
  @ApiPropertyOptional({
    example: 'Teknologi Informasi',
    maxLength: MASTER_NAME_MAX_LENGTH,
  })
  @OptionalNonNull()
  @NameField()
  name?: string;
}

export class DepartmentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Teknologi Informasi' })
  name: string;

  @ApiProperty({ example: 12, description: 'Jumlah karyawan aktif.' })
  employeeCount: number;

  @ApiProperty({ example: 3 })
  positionCount: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Jabatan
// ---------------------------------------------------------------------------

export class ListPositionsQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Hanya jabatan di departemen ini.',
  })
  @IsOptional()
  @UuidField()
  departmentId?: string;
}

export class CreatePositionDto {
  @ApiProperty({
    example: 'Backend Developer',
    maxLength: MASTER_NAME_MAX_LENGTH,
  })
  @NameField()
  name: string;

  @ApiProperty({ format: 'uuid' })
  @UuidField()
  departmentId: string;
}

export class UpdatePositionDto {
  @ApiPropertyOptional({
    example: 'Backend Developer',
    maxLength: MASTER_NAME_MAX_LENGTH,
  })
  @OptionalNonNull()
  @NameField()
  name?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Pindah departemen hanya jika jabatan belum dipakai karyawan.',
  })
  @OptionalNonNull()
  @UuidField()
  departmentId?: string;
}

export class PositionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Backend Developer' })
  name: string;

  @ApiProperty({ type: NamedRefDto })
  department: NamedRefDto;

  @ApiProperty({ example: 4, description: 'Jumlah karyawan aktif.' })
  employeeCount: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}
