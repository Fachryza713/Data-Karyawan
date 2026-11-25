import {
  createParamDecorator,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest, AuthUser } from '../auth/auth-user.js';

/**
 * User yang login (diisi JwtAuthGuard dari access token). Pakai ini untuk
 * endpoint /me, jangan ambil ID user/karyawan dari parameter.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      // Hanya terjadi jika dipakai di endpoint @Public().
      throw new UnauthorizedException('Belum login');
    }
    return request.user;
  },
);
