import { jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import {
  AuditActions,
  AuthMessages,
  REFRESH_TOKEN_TTL_MS,
} from './auth.constants.js';
import { hashToken, OPAQUE_TOKEN_PATTERN } from './auth.crypto.js';
import { RefreshTokenService } from './refresh-token.service.js';

type CreateArgs = { data: Record<string, unknown> };
type UpdateManyArgs = {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
};

const activeUser = {
  id: 'user-1',
  email: 'karyawan@bluerose.test',
  role: 'EMPLOYEE' as const,
  isActive: true,
  employee: { id: 'emp-1', deletedAt: null },
};

function storedToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'old-token',
    userId: 'user-1',
    familyId: 'family-1',
    tokenHash: hashToken('raw-token'),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null as Date | null,
    replacedById: null,
    user: activeUser,
    ...overrides,
  };
}

function setup(stored: ReturnType<typeof storedToken> | null) {
  const refreshToken = {
    findUnique: jest
      .fn<(args: unknown) => Promise<unknown>>()
      .mockResolvedValue(stored),
    create: jest
      .fn<(args: CreateArgs) => Promise<{ id: string }>>()
      .mockResolvedValue({ id: 'new-token' }),
    updateMany: jest
      .fn<(args: UpdateManyArgs) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 1 }),
  };
  const client = {
    refreshToken,
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };
  const audit = {
    record: jest.fn<(entry: unknown) => Promise<void>>(),
  };
  audit.record.mockResolvedValue(undefined);

  const service = new RefreshTokenService(
    { client } as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  return { service, refreshToken, audit };
}

const meta = { ip: '10.0.0.1', userAgent: 'jest' };

describe('RefreshTokenService', () => {
  it('issue menyimpan hash SHA-256 (bukan token mentah), family baru, 7 hari', async () => {
    const { service, refreshToken } = setup(null);
    const before = Date.now();

    const issued = await service.issue('user-1', meta);

    expect(issued.token).toMatch(OPAQUE_TOKEN_PATTERN);
    const { data } = refreshToken.create.mock.calls[0][0];
    expect(data.tokenHash).toBe(hashToken(issued.token));
    expect(Object.values(data)).not.toContain(issued.token);
    expect(data.familyId).toMatch(/^[0-9a-f-]{36}$/);
    expect(data).toMatchObject({ userId: 'user-1', ip: '10.0.0.1' });
    const expiresAt = (data.expiresAt as Date).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + REFRESH_TOKEN_TTL_MS);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + REFRESH_TOKEN_TTL_MS);
  });

  it('dua login membuat dua family berbeda', async () => {
    const { service, refreshToken } = setup(null);

    await service.issue('user-1', meta);
    await service.issue('user-1', meta);

    const [first, second] = refreshToken.create.mock.calls.map(
      ([args]) => args.data.familyId,
    );
    expect(first).not.toBe(second);
  });

  describe('rotate', () => {
    it('mencabut token lama, mengisi replacedById, dan menerbitkan token baru di family yang sama', async () => {
      const { service, refreshToken, audit } = setup(storedToken());

      const result = await service.rotate('raw-token', meta);

      expect(refreshToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: hashToken('raw-token') },
        }),
      );
      const { data } = refreshToken.create.mock.calls[0][0];
      expect(data.familyId).toBe('family-1');
      expect(data.tokenHash).toBe(hashToken(result.refreshToken.token));
      expect(result.refreshToken.token).not.toBe('raw-token');

      expect(refreshToken.updateMany).toHaveBeenCalledTimes(1);
      const update = refreshToken.updateMany.mock.calls[0][0];
      expect(update.where).toEqual({ id: 'old-token', revokedAt: null });
      expect(update.data.replacedById).toBe('new-token');
      expect(update.data.revokedAt).toBeInstanceOf(Date);

      expect(result.user).toBe(activeUser);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('reuse: token yang sudah dirotasi dipakai lagi mencabut seluruh family dan 401', async () => {
      const { service, refreshToken, audit } = setup(
        storedToken({
          revokedAt: new Date(Date.now() - 1000),
          replacedById: 'token-pengganti',
        }),
      );

      await expect(service.rotate('raw-token', meta)).rejects.toThrow(
        new UnauthorizedException(AuthMessages.sessionReused),
      );

      expect(refreshToken.create).not.toHaveBeenCalled();
      const update = refreshToken.updateMany.mock.calls[0][0];
      expect(update.where).toEqual({ familyId: 'family-1', revokedAt: null });
      expect(update.data.revokedAt).toBeInstanceOf(Date);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditActions.refreshReuse,
          actorId: 'user-1',
          after: { familyId: 'family-1' },
        }),
      );
    });

    it('token yang dicabut karena logout: 401 biasa, family dan audit tidak disentuh', async () => {
      const { service, refreshToken, audit } = setup(
        storedToken({ revokedAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.rotate('raw-token', meta)).rejects.toThrow(
        new UnauthorizedException(AuthMessages.sessionInvalid),
      );
      expect(refreshToken.updateMany).not.toHaveBeenCalled();
      expect(refreshToken.create).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('reuse saat balapan: token sudah dirotasi request lain juga mencabut family', async () => {
      const { service, refreshToken } = setup(storedToken());
      // Pembaruan token lama tidak mengenai baris (sudah dicabut request lain).
      refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.rotate('raw-token', meta)).rejects.toThrow(
        AuthMessages.sessionReused,
      );

      const familyRevoke = refreshToken.updateMany.mock.calls[1][0];
      expect(familyRevoke.where).toEqual({
        familyId: 'family-1',
        revokedAt: null,
      });
    });

    it('token kedaluwarsa ditolak 401 tanpa menerbitkan token baru', async () => {
      const { service, refreshToken } = setup(
        storedToken({ expiresAt: new Date(Date.now() - 1) }),
      );

      await expect(service.rotate('raw-token', meta)).rejects.toThrow(
        new UnauthorizedException(AuthMessages.sessionExpired),
      );
      expect(refreshToken.create).not.toHaveBeenCalled();
      expect(refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('token tidak dikenal ditolak 401', async () => {
      const { service, refreshToken } = setup(null);

      await expect(service.rotate('tidak-ada', meta)).rejects.toThrow(
        new UnauthorizedException(AuthMessages.sessionInvalid),
      );
      expect(refreshToken.create).not.toHaveBeenCalled();
    });

    it.each([
      ['user nonaktif', { ...activeUser, isActive: false }],
      [
        'karyawan sudah dihapus',
        { ...activeUser, employee: { id: 'emp-1', deletedAt: new Date() } },
      ],
    ])('%s: 401 dan family dicabut', async (_label, user) => {
      const { service, refreshToken } = setup(storedToken({ user }));

      await expect(service.rotate('raw-token', meta)).rejects.toThrow(
        AuthMessages.sessionInvalid,
      );
      expect(refreshToken.create).not.toHaveBeenCalled();
      expect(refreshToken.updateMany.mock.calls[0][0].where).toEqual({
        familyId: 'family-1',
        revokedAt: null,
      });
    });
  });

  it('revoke hanya mencabut token yang belum dicabut', async () => {
    const { service, refreshToken } = setup(null);

    await service.revoke('raw-token');

    expect(refreshToken.updateMany.mock.calls[0][0].where).toEqual({
      tokenHash: hashToken('raw-token'),
      revokedAt: null,
    });
  });

  it('revokeAllForUser mencabut semua sesi aktif user', async () => {
    const { service, refreshToken } = setup(null);
    refreshToken.updateMany.mockResolvedValueOnce({ count: 3 });

    await expect(service.revokeAllForUser('user-1')).resolves.toBe(3);
    expect(refreshToken.updateMany.mock.calls[0][0].where).toEqual({
      userId: 'user-1',
      revokedAt: null,
    });
  });
});
