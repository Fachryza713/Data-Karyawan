import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenPayload } from '../../common/auth/auth-user.js';
import type { ClientMeta } from '../../common/decorators/client-meta.decorator.js';
import { normalizeEmail } from '../../common/validation/formats.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { canHoldSession } from './account-policy.js';
import { AuditActions, AuthMessages } from './auth.constants.js';
import {
  generateOpaqueToken,
  hashPassword,
  verifyPassword,
} from './auth.crypto.js';
import type { LoginDto } from './dto/auth-request.dto.js';
import type { AuthUserDto, MeResponseDto } from './dto/auth-response.dto.js';
import {
  type IssuedRefreshToken,
  RefreshTokenService,
  SESSION_USER_SELECT,
  type SessionUser,
} from './refresh-token.service.js';

/** Hasil login/refresh. refreshToken dipasang controller sebagai cookie. */
export type AuthSession = {
  accessToken: string;
  refreshToken: IssuedRefreshToken;
  user: AuthUserDto;
};

const ME_SELECT = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  employee: {
    select: {
      id: true,
      nip: true,
      fullName: true,
      phone: true,
      gender: true,
      birthDate: true,
      photoKey: true,
      joinDate: true,
      employmentStatus: true,
      deletedAt: true,
      department: { select: { id: true, name: true } },
      position: { select: { id: true, name: true } },
      officeLocation: { select: { id: true, name: true } },
      shift: {
        select: {
          id: true,
          name: true,
          startTime: true,
          endTime: true,
          lateToleranceMin: true,
        },
      },
    },
  },
} as const satisfies Prisma.UserSelect;

/** Tanggal kalender (kolom @db.Date) sebagai "YYYY-MM-DD". */
const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);

@Injectable()
export class AuthService {
  /** Hash palsu untuk email yang tidak terdaftar (lihat login). */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Login email + password. Email tidak terdaftar dan password salah
   * mendapat pesan dan waktu proses yang sama (argon2 tetap dijalankan),
   * supaya tidak bisa dipakai menebak email yang terdaftar.
   */
  async login(dto: LoginDto, meta: ClientMeta): Promise<AuthSession> {
    const email = normalizeEmail(dto.email);
    const user = await this.prisma.client.user.findUnique({
      where: { email },
      select: { ...SESSION_USER_SELECT, passwordHash: true },
    });

    const passwordHash = user?.passwordHash ?? (await this.getDummyHash());
    const passwordOk = await verifyPassword(passwordHash, dto.password);

    if (!user || !passwordOk) {
      await this.audit.record({
        actorId: user?.id ?? null,
        action: AuditActions.loginFailed,
        entity: 'User',
        entityId: user?.id ?? email,
        after: { email, reason: user ? 'wrong_password' : 'unknown_email' },
        ...meta,
      });
      throw new UnauthorizedException(AuthMessages.invalidCredentials);
    }

    // Dicek setelah password benar: status akun hanya diberitahukan ke
    // pemilik password, bukan ke siapa saja yang menebak email.
    if (!canHoldSession(user)) {
      await this.audit.record({
        actorId: user.id,
        action: AuditActions.loginFailed,
        entity: 'User',
        entityId: user.id,
        after: { email, reason: 'inactive' },
        ...meta,
      });
      throw new ForbiddenException(AuthMessages.inactiveAccount);
    }

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const refreshToken = await this.refreshTokens.issue(user.id, meta);
    await this.audit.record({
      actorId: user.id,
      action: AuditActions.loginSuccess,
      entity: 'User',
      entityId: user.id,
      ...meta,
    });

    return this.buildSession(user, refreshToken);
  }

  /** Rotasi refresh token lalu terbitkan access token baru. */
  async refresh(
    rawToken: string | undefined,
    meta: ClientMeta,
  ): Promise<AuthSession> {
    if (!rawToken) {
      throw new UnauthorizedException(AuthMessages.sessionInvalid);
    }
    const { refreshToken, user } = await this.refreshTokens.rotate(
      rawToken,
      meta,
    );
    return this.buildSession(user, refreshToken);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (rawToken) {
      await this.refreshTokens.revoke(rawToken);
    }
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId);
  }

  async me(userId: string): Promise<MeResponseDto> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: ME_SELECT,
    });
    if (!user || !canHoldSession(user)) {
      throw new UnauthorizedException(AuthMessages.sessionInvalid);
    }

    const { employee } = user;
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      employee: employee && {
        id: employee.id,
        nip: employee.nip,
        fullName: employee.fullName,
        phone: employee.phone,
        gender: employee.gender,
        birthDate: employee.birthDate ? toDateOnly(employee.birthDate) : null,
        photoKey: employee.photoKey,
        joinDate: toDateOnly(employee.joinDate),
        employmentStatus: employee.employmentStatus,
        department: employee.department,
        position: employee.position,
        officeLocation: employee.officeLocation,
        shift: employee.shift,
      },
    };
  }

  private async buildSession(
    user: SessionUser,
    refreshToken: IssuedRefreshToken,
  ): Promise<AuthSession> {
    const employeeId = user.employee?.id ?? null;
    const payload: AccessTokenPayload = {
      sub: user.id,
      role: user.role,
      employeeId,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role, employeeId },
    };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hashPassword(generateOpaqueToken());
    return this.dummyHash;
  }
}
