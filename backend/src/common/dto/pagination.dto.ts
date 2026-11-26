import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

/** Query ?page=&limit= untuk endpoint daftar. */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt({ message: 'page harus bilangan bulat' })
  @Min(1, { message: 'page minimal 1' })
  page: number = 1;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_PAGE_LIMIT,
    default: DEFAULT_PAGE_LIMIT,
  })
  @Type(() => Number)
  @IsInt({ message: 'limit harus bilangan bulat' })
  @Min(1, { message: 'limit minimal 1' })
  @Max(MAX_PAGE_LIMIT, { message: `limit maksimal ${MAX_PAGE_LIMIT}` })
  limit: number = DEFAULT_PAGE_LIMIT;
}

export class PageMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export function buildPageMeta(
  page: number,
  limit: number,
  total: number,
): PageMetaDto {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

/** Argumen skip/take Prisma dari page dan limit. */
export function pageToSkipTake(page: number, limit: number) {
  return { skip: (page - 1) * limit, take: limit };
}
