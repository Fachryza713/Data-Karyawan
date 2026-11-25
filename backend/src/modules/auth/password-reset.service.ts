import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ClientMeta } from '../../common/decorators/client-meta.decorator.js';
import { normalizeEmail } from '../../common/validation/formats.js';
import type { Env } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { MailService } from '../mail/mail.service.js';
import { canHoldSession } from './account-policy.js';
import {
  AuditActions,
  AuthMessages,
  PASSWORD_RESET_TTL_MS,
} from './auth.constants.js';
import { generateOpaqueToken, hashPassword, hashToken } from './auth.crypto.js';
import { RefreshTokenService } from './refresh-token.service.js';

const RESET_TTL_MINUTES = PASSWORD_RESET_TTL_MS / 60_000;

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.frontendUrl = config.get('FRONTEND_URL', { infer: true });
  }

  /**
   * Endpoint lupa password selalu membalas sama. Pekerjaannya (cari user,
   * simpan token, kirim email) jalan di latar belakang supaya waktu respons
   * juga tidak membocorkan apakah email terdaftar. Gagal kirim hanya dicatat.
   */
  requestReset(email: string, meta: ClientMeta): void {
    this.issueResetLink(email, meta).catch((error: unknown) => {
      this.logger.error(
        { err: error },
        'Gagal memproses permintaan reset password',
      );
    });
  }

  /**
   * Buat token sekali pakai (30 menit) dan kirim link reset jika email milik
   * akun aktif. Token lama yang belum dipakai ikut dibatalkan, jadi hanya
   * link terbaru yang berlaku. Mengembalikan true jika email dikirim.
   */
  async issueResetLink(email: string, meta: ClientMeta): Promise<boolean> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: normalizeEmail(email) },
      select: {
        id: true,
        email: true,
        isActive: true,
        employee: { select: { fullName: true, deletedAt: true } },
      },
    });
    if (!user || !canHoldSession(user)) {
      return false;
    }

    const now = new Date();
    const token = generateOpaqueToken();
    await this.prisma.client.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      });
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
        },
      });
    });

    const link = this.resetLink(token);
    const name = user.employee?.fullName ?? user.email;
    await this.mail.send({
      to: user.email,
      subject: 'Reset password HRIS Blue Rose Tech',
      text: [
        `Halo ${name},`,
        '',
        'Kami menerima permintaan reset password akun HRIS Anda.',
        `Buka link berikut dalam ${RESET_TTL_MINUTES} menit untuk membuat password baru:`,
        link,
        '',
        'Link hanya bisa dipakai sekali. Abaikan email ini jika Anda tidak memintanya.',
        meta.ip ? `Permintaan dari IP ${meta.ip}.` : '',
      ].join('\n'),
      html:
        `<p>Halo ${escapeHtml(name)},</p>` +
        '<p>Kami menerima permintaan reset password akun HRIS Anda.</p>' +
        `<p><a href="${escapeHtml(link)}">Buat password baru</a> ` +
        `(berlaku ${RESET_TTL_MINUTES} menit, sekali pakai).</p>` +
        '<p>Abaikan email ini jika Anda tidak memintanya.</p>',
    });
    return true;
  }

  /**
   * Set password baru dari token reset. Token ditandai terpakai, semua token
   * reset lain dibatalkan, dan semua sesi (refresh token) user dicabut.
   */
  async resetPassword(
    rawToken: string,
    newPassword: string,
    meta: ClientMeta,
  ): Promise<void> {
    const now = new Date();
    const record = await this.prisma.client.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        user: {
          select: {
            isActive: true,
            employee: { select: { deletedAt: true } },
          },
        },
      },
    });
    if (
      !record ||
      record.usedAt ||
      record.expiresAt <= now ||
      !canHoldSession(record.user)
    ) {
      throw new BadRequestException(AuthMessages.resetTokenInvalid);
    }

    const passwordHash = await hashPassword(newPassword);
    await this.prisma.client.$transaction(async (tx) => {
      // Klaim token secara atomik: request kedua dengan token sama gagal.
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (count !== 1) {
        throw new BadRequestException(AuthMessages.resetTokenInvalid);
      }
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: now },
      });
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });
      await this.refreshTokens.revokeAllForUser(record.userId, tx);
      await this.audit.record(
        {
          actorId: record.userId,
          action: AuditActions.passwordReset,
          entity: 'User',
          entityId: record.userId,
          ...meta,
        },
        tx,
      );
    });
  }

  /** FRONTEND_URL/update-password?token=... (path FRONTEND_URL dipertahankan). */
  private resetLink(token: string): string {
    const base = this.frontendUrl.replace(/\/+$/, '');
    return `${base}/update-password?token=${encodeURIComponent(token)}`;
  }
}
