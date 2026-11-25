import { jest } from '@jest/globals';
import { BadRequestException, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { verify } from 'argon2';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { MailMessage, MailService } from '../mail/mail.service.js';
import {
  AuditActions,
  AuthMessages,
  PASSWORD_RESET_TTL_MS,
} from './auth.constants.js';
import { hashToken, OPAQUE_TOKEN_PATTERN } from './auth.crypto.js';
import { PasswordResetService } from './password-reset.service.js';
import type { RefreshTokenService } from './refresh-token.service.js';

type DataArgs = {
  where?: Record<string, unknown>;
  data: Record<string, unknown>;
};

const meta = { ip: '10.0.0.1', userAgent: 'jest' };
const FRONTEND_URL = 'http://localhost:5173';

const activeUser = {
  id: 'user-1',
  email: 'karyawan@bluerose.test',
  isActive: true,
  employee: { fullName: 'Raditya Pratama', deletedAt: null as Date | null },
};

function resetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reset-1',
    userId: 'user-1',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null as Date | null,
    user: { isActive: true, employee: { deletedAt: null } },
    ...overrides,
  };
}

function setup(options: { user?: unknown; reset?: unknown } = {}) {
  const user = {
    findUnique: jest
      .fn<(args: unknown) => Promise<unknown>>()
      .mockResolvedValue(options.user ?? null),
    update: jest.fn<(args: DataArgs) => Promise<unknown>>(),
  };
  user.update.mockResolvedValue({});
  const passwordResetToken = {
    findUnique: jest
      .fn<(args: unknown) => Promise<unknown>>()
      .mockResolvedValue(options.reset ?? null),
    create: jest.fn<(args: DataArgs) => Promise<unknown>>(),
    updateMany: jest
      .fn<(args: DataArgs) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 1 }),
  };
  passwordResetToken.create.mockResolvedValue({});
  const client = {
    user,
    passwordResetToken,
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };
  const refreshTokens = {
    revokeAllForUser: jest
      .fn<RefreshTokenService['revokeAllForUser']>()
      .mockResolvedValue(2),
  };
  const mail = { send: jest.fn<(message: MailMessage) => Promise<void>>() };
  mail.send.mockResolvedValue(undefined);
  const audit = { record: jest.fn<AuditService['record']>() };
  audit.record.mockResolvedValue(undefined);
  const config = { get: () => FRONTEND_URL };

  const service = new PasswordResetService(
    { client } as unknown as PrismaService,
    refreshTokens as unknown as RefreshTokenService,
    mail as unknown as MailService,
    audit as unknown as AuditService,
    config as unknown as ConfigService,
  );
  return {
    service,
    client,
    user,
    passwordResetToken,
    refreshTokens,
    mail,
    audit,
  };
}

describe('PasswordResetService.issueResetLink', () => {
  it('email tidak terdaftar: tidak membuat token, tidak mengirim email', async () => {
    const { service, passwordResetToken, mail } = setup();

    await expect(
      service.issueResetLink('tidak.ada@bluerose.test', meta),
    ).resolves.toBe(false);
    expect(passwordResetToken.create).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('akun nonaktif tidak mendapat link reset', async () => {
    const { service, mail } = setup({
      user: { ...activeUser, isActive: false },
    });

    await expect(service.issueResetLink(activeUser.email, meta)).resolves.toBe(
      false,
    );
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('membuat token 30 menit (hash saja yang disimpan) dan mengirim link FRONTEND_URL/update-password', async () => {
    const { service, passwordResetToken, mail } = setup({ user: activeUser });
    const before = Date.now();

    await expect(
      service.issueResetLink('Karyawan@BlueRose.test', meta),
    ).resolves.toBe(true);

    const message = mail.send.mock.calls[0][0];
    expect(message.to).toBe('karyawan@bluerose.test');
    const link = /http:\/\/localhost:5173\/update-password\?token=(\S+)/.exec(
      message.text,
    );
    expect(link).not.toBeNull();
    const token = decodeURIComponent(link![1]);
    expect(token).toMatch(OPAQUE_TOKEN_PATTERN);
    expect(message.html).toContain(link![0]);

    const { data } = passwordResetToken.create.mock.calls[0][0];
    expect(data.tokenHash).toBe(hashToken(token));
    expect(Object.values(data)).not.toContain(token);
    const expiresAt = (data.expiresAt as Date).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + PASSWORD_RESET_TTL_MS);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + PASSWORD_RESET_TTL_MS);

    // Link lama yang belum dipakai dibatalkan.
    expect(passwordResetToken.updateMany.mock.calls[0][0].where).toEqual({
      userId: 'user-1',
      usedAt: null,
    });
  });

  it('requestReset tidak melempar walau pengiriman email gagal', async () => {
    const { service, mail } = setup({ user: activeUser });
    mail.send.mockRejectedValue(new Error('SMTP mati'));
    const logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    expect(() => service.requestReset(activeUser.email, meta)).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    expect(logError).toHaveBeenCalled();
    logError.mockRestore();
  });
});

describe('PasswordResetService.resetPassword', () => {
  const TOKEN = 'a'.repeat(43);

  it.each([
    ['tidak dikenal', null],
    ['sudah dipakai', resetRow({ usedAt: new Date() })],
    ['kedaluwarsa', resetRow({ expiresAt: new Date(Date.now() - 1) })],
    [
      'akun nonaktif',
      resetRow({ user: { isActive: false, employee: { deletedAt: null } } }),
    ],
  ])('token %s ditolak 400', async (_label, reset) => {
    const { service, user, refreshTokens } = setup({ reset });

    await expect(
      service.resetPassword(TOKEN, 'PasswordBaru#2026', meta),
    ).rejects.toThrow(new BadRequestException(AuthMessages.resetTokenInvalid));
    expect(user.update).not.toHaveBeenCalled();
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('berhasil: password di-hash argon2id, token terpakai, semua sesi dicabut, dicatat di audit', async () => {
    const { service, client, user, passwordResetToken, refreshTokens, audit } =
      setup({ reset: resetRow() });

    await service.resetPassword(TOKEN, 'PasswordBaru#2026', meta);

    expect(passwordResetToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashToken(TOKEN) } }),
    );
    expect(passwordResetToken.updateMany.mock.calls[0][0].where).toEqual({
      id: 'reset-1',
      usedAt: null,
    });
    const { data } = user.update.mock.calls[0][0];
    const newHash = data.passwordHash as string;
    expect(newHash).toMatch(/^\$argon2id\$/);
    await expect(verify(newHash, 'PasswordBaru#2026')).resolves.toBe(true);

    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(
      'user-1',
      client,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditActions.passwordReset,
        actorId: 'user-1',
        ip: '10.0.0.1',
      }),
      client,
    );
  });

  it('token yang sama dipakai bersamaan: hanya satu yang berhasil', async () => {
    const { service, user, passwordResetToken } = setup({ reset: resetRow() });
    passwordResetToken.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.resetPassword(TOKEN, 'PasswordBaru#2026', meta),
    ).rejects.toThrow(AuthMessages.resetTokenInvalid);
    expect(user.update).not.toHaveBeenCalled();
  });
});
