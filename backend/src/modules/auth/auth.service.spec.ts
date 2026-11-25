import { jest } from '@jest/globals';
import {
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import { AuditActions, AuthMessages } from './auth.constants.js';
import { hashPassword } from './auth.crypto.js';
import { AuthService } from './auth.service.js';
import type { RefreshTokenService } from './refresh-token.service.js';

type FindArgs = { where: unknown; select: Record<string, unknown> };

const meta = { ip: '10.0.0.1', userAgent: 'jest' };
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword('Benar#2026');
});

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'karyawan@bluerose.test',
    role: 'EMPLOYEE' as const,
    isActive: true,
    passwordHash,
    employee: { id: 'emp-1', deletedAt: null as Date | null },
    ...overrides,
  };
}

function setup(found: unknown) {
  const user = {
    findUnique: jest
      .fn<(args: FindArgs) => Promise<unknown>>()
      .mockResolvedValue(found),
    update: jest.fn<(args: unknown) => Promise<unknown>>(),
  };
  user.update.mockResolvedValue({});
  const refreshTokens = {
    issue: jest.fn<RefreshTokenService['issue']>(),
    rotate: jest.fn<RefreshTokenService['rotate']>(),
    revoke: jest.fn<RefreshTokenService['revoke']>(),
    revokeAllForUser: jest.fn<RefreshTokenService['revokeAllForUser']>(),
  };
  refreshTokens.issue.mockResolvedValue({
    token: 'refresh-raw',
    expiresAt: new Date(),
  });
  const audit = { record: jest.fn<AuditService['record']>() };
  audit.record.mockResolvedValue(undefined);
  const jwt = new JwtService({
    secret: 'test-access-secret-0123456789abcdef',
    signOptions: { expiresIn: 900 },
  });

  const service = new AuthService(
    { client: { user } } as unknown as PrismaService,
    jwt,
    refreshTokens as unknown as RefreshTokenService,
    audit as unknown as AuditService,
  );
  return { service, user, refreshTokens, audit, jwt };
}

async function captureError(promise: Promise<unknown>): Promise<HttpException> {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('seharusnya gagal');
}

describe('AuthService.login', () => {
  it('email tidak terdaftar dan password salah mendapat pesan yang sama', async () => {
    const unknown = setup(null);
    const wrong = setup(userRow());

    const unknownError = await captureError(
      unknown.service.login(
        { email: 'tidak.ada@bluerose.test', password: 'Benar#2026' },
        meta,
      ),
    );
    const wrongError = await captureError(
      wrong.service.login(
        { email: 'karyawan@bluerose.test', password: 'Salah#2026' },
        meta,
      ),
    );

    for (const error of [unknownError, wrongError]) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.message).toBe(AuthMessages.invalidCredentials);
    }
    expect(unknown.refreshTokens.issue).not.toHaveBeenCalled();
    expect(wrong.refreshTokens.issue).not.toHaveBeenCalled();
  });

  it('mencatat login gagal ke audit log', async () => {
    const unknown = setup(null);
    const wrong = setup(userRow());

    await captureError(
      unknown.service.login(
        { email: 'Tidak.Ada@BlueRose.test', password: 'x' },
        meta,
      ),
    );
    await captureError(
      wrong.service.login(
        { email: 'karyawan@bluerose.test', password: 'x' },
        meta,
      ),
    );

    expect(unknown.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditActions.loginFailed,
        actorId: null,
        entityId: 'tidak.ada@bluerose.test',
        after: { email: 'tidak.ada@bluerose.test', reason: 'unknown_email' },
        ip: '10.0.0.1',
      }),
    );
    expect(wrong.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditActions.loginFailed,
        actorId: 'user-1',
        after: { email: 'karyawan@bluerose.test', reason: 'wrong_password' },
      }),
    );
  });

  it.each([
    ['user nonaktif', { isActive: false }],
    [
      'karyawan sudah dihapus (soft delete)',
      { employee: { id: 'emp-1', deletedAt: new Date() } },
    ],
  ])('%s ditolak 403 walau password benar', async (_label, overrides) => {
    const { service, refreshTokens, audit } = setup(userRow(overrides));

    const error = await captureError(
      service.login(
        { email: 'karyawan@bluerose.test', password: 'Benar#2026' },
        meta,
      ),
    );

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.message).toBe(AuthMessages.inactiveAccount);
    expect(refreshTokens.issue).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ reason: 'inactive' }),
      }),
    );
  });

  it('berhasil: access token berisi sub/role/employeeId, response tanpa passwordHash', async () => {
    const { service, user, refreshTokens, audit, jwt } = setup(userRow());

    const session = await service.login(
      { email: '  KARYAWAN@bluerose.test ', password: 'Benar#2026' },
      meta,
    );

    expect(user.findUnique.mock.calls[0][0].where).toEqual({
      email: 'karyawan@bluerose.test',
    });
    expect(session.user).toEqual({
      id: 'user-1',
      email: 'karyawan@bluerose.test',
      role: 'EMPLOYEE',
      employeeId: 'emp-1',
    });
    expect(JSON.stringify(session)).not.toContain(passwordHash);

    const payload = await jwt.verifyAsync<Record<string, unknown>>(
      session.accessToken,
    );
    expect(payload).toMatchObject({
      sub: 'user-1',
      role: 'EMPLOYEE',
      employeeId: 'emp-1',
    });
    expect(payload).not.toHaveProperty('email');

    expect(session.refreshToken.token).toBe('refresh-raw');
    expect(refreshTokens.issue).toHaveBeenCalledWith('user-1', meta);
    expect(user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { lastLoginAt: expect.any(Date) as unknown },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditActions.loginSuccess,
        actorId: 'user-1',
      }),
    );
  });
});

describe('AuthService lainnya', () => {
  it('refresh tanpa cookie ditolak 401', async () => {
    const { service, refreshTokens } = setup(null);

    await expect(service.refresh(undefined, meta)).rejects.toThrow(
      new UnauthorizedException(AuthMessages.sessionInvalid),
    );
    expect(refreshTokens.rotate).not.toHaveBeenCalled();
  });

  it('refresh menerbitkan access token baru dari user hasil rotasi', async () => {
    const { service, refreshTokens } = setup(null);
    refreshTokens.rotate.mockResolvedValue({
      refreshToken: { token: 'refresh-baru', expiresAt: new Date() },
      user: {
        id: 'user-1',
        email: 'karyawan@bluerose.test',
        role: 'EMPLOYEE',
        isActive: true,
        employee: { id: 'emp-1', deletedAt: null },
      },
    });

    const session = await service.refresh('refresh-lama', meta);

    expect(refreshTokens.rotate).toHaveBeenCalledWith('refresh-lama', meta);
    expect(session.refreshToken.token).toBe('refresh-baru');
    expect(session.user.employeeId).toBe('emp-1');
  });

  it('me tidak membaca passwordHash dan memformat tanggal kalender', async () => {
    const { service, user } = setup({
      id: 'user-1',
      email: 'karyawan@bluerose.test',
      role: 'EMPLOYEE',
      isActive: true,
      lastLoginAt: new Date('2026-11-25T01:00:00.000Z'),
      employee: {
        id: 'emp-1',
        nip: 'BRT-2024-0001',
        fullName: 'Raditya Pratama',
        phone: null,
        gender: 'MALE',
        birthDate: new Date('1997-05-14T00:00:00.000Z'),
        photoKey: null,
        joinDate: new Date('2024-03-01T00:00:00.000Z'),
        employmentStatus: 'PERMANENT',
        deletedAt: null,
        department: { id: 'd1', name: 'Teknologi Informasi' },
        position: { id: 'p1', name: 'Frontend Developer' },
        officeLocation: { id: 'o1', name: 'Head Office Jakarta' },
        shift: {
          id: 's1',
          name: 'Reguler',
          startTime: '08:30',
          endTime: '17:30',
          lateToleranceMin: 15,
        },
      },
    });

    const me = await service.me('user-1');

    expect(user.findUnique.mock.calls[0][0].select).not.toHaveProperty(
      'passwordHash',
    );
    expect(me).not.toHaveProperty('isActive');
    expect(me.lastLoginAt).toBe('2026-11-25T01:00:00.000Z');
    expect(me.employee).toMatchObject({
      nip: 'BRT-2024-0001',
      birthDate: '1997-05-14',
      joinDate: '2024-03-01',
      shift: { startTime: '08:30' },
    });
    expect(me.employee).not.toHaveProperty('deletedAt');
  });

  it('me menolak 401 jika akun sudah nonaktif', async () => {
    const { service } = setup({
      id: 'user-1',
      isActive: false,
      employee: null,
    });

    await expect(service.me('user-1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('logout tanpa cookie tidak menyentuh database', async () => {
    const { service, refreshTokens } = setup(null);

    await service.logout(undefined);

    expect(refreshTokens.revoke).not.toHaveBeenCalled();
  });
});
