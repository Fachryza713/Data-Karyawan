import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../../generated/prisma/enums.js';
import type { AuthenticatedRequest } from '../auth/auth-user.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

/**
 * Guard global setelah JwtAuthGuard. Endpoint tanpa @Roles() boleh diakses
 * semua user yang login; dengan @Roles(...) hanya role yang disebut.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) {
      // @Roles di endpoint @Public: tidak ada user untuk dicek.
      throw new UnauthorizedException('Belum login');
    }
    if (!roles.includes(user.role)) {
      throw new ForbiddenException('Anda tidak punya akses ke fitur ini');
    }
    return true;
  }
}
