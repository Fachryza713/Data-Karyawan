import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { ClientMeta } from '../../common/decorators/client-meta.decorator.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  type AppTransactionClient,
  PrismaService,
} from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { canHoldSession } from './account-policy.js';
import {
  AuditActions,
  AuthMessages,
  REFRESH_TOKEN_TTL_MS,
} from './auth.constants.js';
import { generateOpaqueToken, hashToken } from './auth.crypto.js';

/** Data user yang dibutuhkan untuk menerbitkan access token baru. */
export const SESSION_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  employee: { select: { id: true, deletedAt: true } },
} as const satisfies Prisma.UserSelect;

export type SessionUser = Prisma.UserGetPayload<{
  select: typeof SESSION_USER_SELECT;
}>;

export type IssuedRefreshToken = {
  /** Token mentah, hanya dikirim ke klien (cookie), tidak disimpan. */
  token: string;
  expiresAt: Date;
};

/** Rotasi kalah balapan: token sudah dirotasi request lain. */
class ConcurrentRotationError extends Error {}

/**
 * Refresh token opaque dengan rotasi dan deteksi pemakaian ulang.
 *
 * - Login membuat family baru. Setiap refresh membuat token baru di family
 *   yang sama, mencabut token lama, dan mengisi replacedById.
 * - Token yang sudah dirotasi (replacedById terisi) tetapi dipakai lagi
 *   berarti token itu bocor (atau dicuri lalu dipakai duluan): seluruh family
 *   dicabut, jadi pencuri dan pemilik sama-sama harus login ulang.
 * - Token yang dicabut karena logout/reset password hanya ditolak 401.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Terbitkan token untuk sesi baru (login). */
  async issue(userId: string, meta: ClientMeta): Promise<IssuedRefreshToken> {
    return this.create(this.prisma.client, userId, randomUUID(), meta);
  }

  /**
   * Tukar token lama dengan token baru di family yang sama.
   * Gagal 401 jika token tidak dikenal, kedaluwarsa, dipakai ulang, atau
   * akunnya sudah nonaktif.
   */
  async rotate(
    rawToken: string,
    meta: ClientMeta,
  ): Promise<{ refreshToken: IssuedRefreshToken; user: SessionUser }> {
    const now = new Date();
    const current = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: { select: SESSION_USER_SELECT } },
    });

    if (!current) {
      throw new UnauthorizedException(AuthMessages.sessionInvalid);
    }
    if (current.revokedAt) {
      if (current.replacedById) {
        // Sudah pernah dirotasi: pemakaian kedua berarti token bocor.
        await this.handleReuse(current, meta, now);
      }
      // Dicabut karena logout/reset password: cukup tolak.
      throw new UnauthorizedException(AuthMessages.sessionInvalid);
    }
    if (current.expiresAt <= now) {
      throw new UnauthorizedException(AuthMessages.sessionExpired);
    }
    if (!canHoldSession(current.user)) {
      await this.revokeFamily(current.familyId, now);
      throw new UnauthorizedException(AuthMessages.sessionInvalid);
    }

    try {
      const refreshToken = await this.prisma.client.$transaction(async (tx) => {
        const next = await this.create(
          tx,
          current.userId,
          current.familyId,
          meta,
        );
        const { count } = await tx.refreshToken.updateMany({
          where: { id: current.id, revokedAt: null },
          data: { revokedAt: now, replacedById: next.id },
        });
        if (count !== 1) {
          throw new ConcurrentRotationError();
        }
        return next;
      });
      return {
        refreshToken: {
          token: refreshToken.token,
          expiresAt: refreshToken.expiresAt,
        },
        user: current.user,
      };
    } catch (error) {
      if (error instanceof ConcurrentRotationError) {
        // Token yang sama dirotasi dua kali: perlakukan sebagai reuse.
        return this.handleReuse(current, meta, now);
      }
      throw error;
    }
  }

  /** Cabut satu token (logout). Token tak dikenal/sudah dicabut diabaikan. */
  async revoke(rawToken: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Cabut semua sesi user (logout semua perangkat, reset password). */
  async revokeAllForUser(
    userId: string,
    tx?: AppTransactionClient,
  ): Promise<number> {
    const db = tx ?? this.prisma.client;
    const { count } = await db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }

  private async handleReuse(
    token: { id: string; userId: string; familyId: string },
    meta: ClientMeta,
    now: Date,
  ): Promise<never> {
    await this.revokeFamily(token.familyId, now);
    await this.audit.record({
      actorId: token.userId,
      action: AuditActions.refreshReuse,
      entity: 'RefreshToken',
      entityId: token.id,
      after: { familyId: token.familyId },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    throw new UnauthorizedException(AuthMessages.sessionReused);
  }

  private async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  private async create(
    db: AppTransactionClient | PrismaService['client'],
    userId: string,
    familyId: string,
    meta: ClientMeta,
  ): Promise<IssuedRefreshToken & { id: string }> {
    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    const record = await db.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        familyId,
        expiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
      select: { id: true },
    });
    return { id: record.id, token, expiresAt };
  }
}
