import { type ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { normalizeEmail } from '../../../common/validation/formats.js';

/** Nama throttler (lihat ThrottlerModule di AuthModule). */
export const LOGIN_THROTTLER = 'login';
export const FORGOT_PASSWORD_THROTTLER = 'forgotPassword';

/**
 * Batas percobaan per kombinasi IP + email, supaya satu IP tidak bisa
 * menebak password banyak akun dan satu akun tidak bisa ditebak dari satu IP
 * tanpa batas. Body dibaca mentah karena guard jalan sebelum ValidationPipe.
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(request: Record<string, unknown>) {
    return Promise.resolve(authThrottleTracker(request));
  }

  /**
   * Bawaan throttler bernama hanya memasang "Retry-After-<nama>". Tambahkan
   * header standar Retry-After (detik) yang dikenali klien HTTP umum.
   */
  protected override throwThrottlingException(
    context: ExecutionContext,
    detail: Parameters<ThrottlerGuard['throwThrottlingException']>[1],
  ): Promise<void> {
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Retry-After', String(detail.timeToBlockExpire));
    return super.throwThrottlingException(context, detail);
  }
}

export function authThrottleTracker(request: Record<string, unknown>): string {
  const ip = typeof request.ip === 'string' ? request.ip : 'unknown-ip';
  const body = request.body as Record<string, unknown> | undefined;
  const email =
    typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
  return `${ip}|${email}`;
}
