import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AuthenticatedRequest } from '../auth/auth-user.js';
import { Public } from '../decorators/public.decorator.js';
import { extractBearerToken, JwtAuthGuard } from './jwt-auth.guard.js';

const SECRET = 'test-access-secret-0123456789abcdef';

class SampleController {
  @Public()
  open() {}

  closed() {}
}

function contextFor(
  handler: () => void,
  authorization?: string,
): { context: ExecutionContext; request: AuthenticatedRequest } {
  const request = { headers: { authorization } } as AuthenticatedRequest;
  const context = {
    getClass: () => SampleController,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({
    secret: SECRET,
    signOptions: { algorithm: 'HS256', expiresIn: 900 },
    verifyOptions: { algorithms: ['HS256'] },
  });
  const guard = new JwtAuthGuard(new Reflector(), jwt);
  const { open, closed } = SampleController.prototype;
  const payload = { sub: 'user-1', role: 'HR', employeeId: 'emp-1' };

  it('endpoint @Public tidak butuh token', async () => {
    await expect(guard.canActivate(contextFor(open).context)).resolves.toBe(
      true,
    );
  });

  it('401 tanpa header Authorization', async () => {
    await expect(
      guard.canActivate(contextFor(closed).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('token valid mengisi request.user dari payload', async () => {
    const token = await jwt.signAsync(payload);
    const { context, request } = contextFor(closed, `Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      id: 'user-1',
      role: 'HR',
      employeeId: 'emp-1',
    });
  });

  it('access token berlaku 15 menit', async () => {
    const token = await jwt.signAsync(payload);
    const { exp, iat } = jwt.decode<{ exp: number; iat: number }>(token);
    expect(exp - iat).toBe(15 * 60);
  });

  it('401 untuk token kedaluwarsa', async () => {
    const issuer = new JwtService({ secret: SECRET });
    const expired = await issuer.signAsync({
      ...payload,
      exp: Math.floor(Date.now() / 1000) - 10,
    });

    await expect(
      guard.canActivate(contextFor(closed, `Bearer ${expired}`).context),
    ).rejects.toThrow('Access token tidak valid atau kedaluwarsa');
  });

  it('401 untuk token dengan secret lain', async () => {
    const forged = await new JwtService({
      secret: 'secret-lain-0123456789abcdef-0123',
    }).signAsync(payload);

    await expect(
      guard.canActivate(contextFor(closed, `Bearer ${forged}`).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('401 jika payload tidak lengkap atau role tidak dikenal', async () => {
    for (const bad of [
      { sub: 'user-1', employeeId: null },
      { sub: 'user-1', role: 'ADMIN', employeeId: null },
    ]) {
      const token = await jwt.signAsync(bad);
      await expect(
        guard.canActivate(contextFor(closed, `Bearer ${token}`).context),
      ).rejects.toThrow('Access token tidak valid');
    }
  });

  it('extractBearerToken hanya menerima skema Bearer', () => {
    expect(extractBearerToken('Bearer abc')).toBe('abc');
    expect(extractBearerToken('bearer abc')).toBe('abc');
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken('Bearer')).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
  });
});
