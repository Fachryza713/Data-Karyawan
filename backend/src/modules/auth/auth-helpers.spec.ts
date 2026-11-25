import type { Request } from 'express';
import { canHoldSession } from './account-policy.js';
import {
  generateOpaqueToken,
  hashToken,
  OPAQUE_TOKEN_PATTERN,
  verifyPassword,
} from './auth.crypto.js';
import { authThrottleTracker } from './guards/auth-throttler.guard.js';
import { RefreshCookie, refreshCookieOptions } from './refresh-cookie.js';
import type { ConfigService } from '@nestjs/config';

describe('canHoldSession', () => {
  it.each([
    [true, { isActive: true, employee: { deletedAt: null } }],
    [true, { isActive: true, employee: null }],
    [false, { isActive: false, employee: { deletedAt: null } }],
    [false, { isActive: true, employee: { deletedAt: new Date() } }],
  ])('%s untuk %j', (expected, account) => {
    expect(canHoldSession(account)).toBe(expected);
  });
});

describe('token kripto', () => {
  it('token opaque 256-bit base64url dan selalu berbeda', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).toMatch(OPAQUE_TOKEN_PATTERN);
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(a).not.toBe(b);
  });

  it('hashToken = SHA-256 hex', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('verifyPassword false untuk hash rusak (bukan error 500)', async () => {
    await expect(verifyPassword('bukan-hash', 'x')).resolves.toBe(false);
  });
});

describe('cookie refresh token', () => {
  it('development + lax: httpOnly, tidak Secure, path endpoint auth', () => {
    expect(
      refreshCookieOptions({
        NODE_ENV: 'development',
        AUTH_COOKIE_SAMESITE: 'lax',
      }),
    ).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/api/v1/auth',
    });
  });

  it('production selalu Secure', () => {
    expect(
      refreshCookieOptions({
        NODE_ENV: 'production',
        AUTH_COOKIE_SAMESITE: 'strict',
      }).secure,
    ).toBe(true);
  });

  it('SameSite=None (frontend beda domain) memaksa Secure', () => {
    expect(
      refreshCookieOptions({
        NODE_ENV: 'development',
        AUTH_COOKIE_SAMESITE: 'none',
      }),
    ).toMatchObject({ sameSite: 'none', secure: true });
  });

  it('read mengabaikan cookie kosong atau tidak ada', () => {
    const config = {
      get: (key: string) => (key === 'NODE_ENV' ? 'test' : 'lax'),
    } as unknown as ConfigService;
    const cookie = new RefreshCookie(config);
    const req = (cookies?: Record<string, string>) =>
      ({ cookies }) as unknown as Request;

    expect(cookie.read(req())).toBeUndefined();
    expect(cookie.read(req({ refresh_token: '' }))).toBeUndefined();
    expect(cookie.read(req({ refresh_token: 'abc' }))).toBe('abc');
  });
});

describe('authThrottleTracker', () => {
  it('kombinasi IP + email yang dinormalisasi', () => {
    expect(
      authThrottleTracker({
        ip: '10.0.0.1',
        body: { email: ' HR@BlueRose.test ' },
      }),
    ).toBe('10.0.0.1|hr@bluerose.test');
  });

  it('tetap punya kunci walau body tidak berisi email', () => {
    expect(authThrottleTracker({ ip: '10.0.0.1' })).toBe('10.0.0.1|');
    expect(authThrottleTracker({ body: { email: 5 } })).toBe('unknown-ip|');
  });
});
