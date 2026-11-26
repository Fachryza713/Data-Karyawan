import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiForbiddenResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../dto/error-response.dto.js';
import type { Role } from '../../generated/prisma/enums.js';

export const ROLES_KEY = 'auth:roles';

/**
 * Batasi endpoint ke role tertentu, contoh `@Roles(Role.HR)`. Dicek oleh
 * RolesGuard global setelah JwtAuthGuard. Bisa dipasang di controller atau method.
 */
export const Roles = (...roles: Role[]): ClassDecorator & MethodDecorator =>
  // Tipe kembalian applyDecorators di Nest 12 terlalu lebar untuk
  // TypeScript 6 saat dipasang di class; dipersempit di sini.
  applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    ApiForbiddenResponse({
      description: `Hanya untuk role: ${roles.join(', ')}`,
      type: ErrorResponseDto,
    }),
  ) as ClassDecorator & MethodDecorator;
