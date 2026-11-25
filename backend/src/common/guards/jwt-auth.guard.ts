import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../../generated/prisma/enums.js';
import type {
  AccessTokenPayload,
  AuthenticatedRequest,
} from '../auth/auth-user.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

const ROLES = new Set<string>(Object.values(Role));

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.sub === 'string' &&
    typeof payload.role === 'string' &&
    ROLES.has(payload.role) &&
    (payload.employeeId === null || typeof payload.employeeId === 'string')
  );
}

/** Ambil token dari header "Authorization: Bearer <token>". */
export function extractBearerToken(header: string | undefined): string | null {
  const [scheme, token] = header?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/**
 * Guard global: setiap endpoint wajib access token JWT yang valid, kecuali
 * diberi @Public(). Stateless: tidak membaca database, jadi akun yang
 * dinonaktifkan masih bisa memakai access token-nya sampai kedaluwarsa
 * (maksimal 15 menit); refresh token-nya sudah tidak bisa dipakai.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Access token tidak ada');
    }

    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync<object>(token);
    } catch {
      throw new UnauthorizedException(
        'Access token tidak valid atau kedaluwarsa',
      );
    }
    if (!isAccessTokenPayload(payload)) {
      throw new UnauthorizedException('Access token tidak valid');
    }

    request.user = {
      id: payload.sub,
      role: payload.role,
      employeeId: payload.employeeId,
    };
    return true;
  }
}
