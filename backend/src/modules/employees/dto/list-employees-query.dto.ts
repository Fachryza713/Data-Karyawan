import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { UuidField } from './employee-fields.js';

export const EMPLOYEE_STATUS_FILTERS = ['active', 'inactive'] as const;
export type EmployeeStatusFilter = (typeof EMPLOYEE_STATUS_FILTERS)[number];

export const EMPLOYEE_SORT_FIELDS = [
  'fullName',
  'nip',
  'joinDate',
  'createdAt',
] as const;
export type EmployeeSortField = (typeof EMPLOYEE_SORT_FIELDS)[number];

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

/** Spasi di tepi dibuang; teks kosong dianggap tidak mencari. */
const toSearchTerm = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class ListEmployeesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Cari sebagian nama, NIP, atau email (tidak peka huruf besar/kecil).',
    example: 'raditya',
  })
  @IsOptional()
  @Transform(toSearchTerm)
  @IsString()
  @MaxLength(100, { message: 'search maksimal 100 karakter' })
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @UuidField()
  departmentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @UuidField()
  positionId?: string;

  @ApiPropertyOptional({
    enum: EMPLOYEE_STATUS_FILTERS,
    default: 'active',
    description: 'active = belum dihapus; inactive = sudah di-soft delete.',
  })
  @IsIn(EMPLOYEE_STATUS_FILTERS, {
    message: 'status harus active atau inactive',
  })
  status: EmployeeStatusFilter = 'active';

  @ApiPropertyOptional({ enum: EMPLOYEE_SORT_FIELDS, default: 'fullName' })
  @IsIn(EMPLOYEE_SORT_FIELDS, {
    message: `sort harus salah satu dari ${EMPLOYEE_SORT_FIELDS.join(', ')}`,
  })
  sort: EmployeeSortField = 'fullName';

  @ApiPropertyOptional({ enum: SORT_ORDERS, default: 'asc' })
  @IsIn(SORT_ORDERS, { message: 'order harus asc atau desc' })
  order: SortOrder = 'asc';
}
