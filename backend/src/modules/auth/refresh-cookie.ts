import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../../config/env.validation.js';
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_TTL_MS,
} from './auth.constants.js';

/**
 * Opsi cookie refresh token: httpOnly (tidak terbaca JavaScript), path hanya
 * endpoint auth, Secure di produksi. SameSite=None (frontend beda domain)
 * wajib Secure, kalau tidak browser menolak cookie-nya.
 */
export function refreshCookieOptions(
  env: Pick<Env, 'NODE_ENV' | 'AUTH_COOKIE_SAMESITE'>,
): CookieOptions {
  const sameSite = env.AUTH_COOKIE_SAMESITE;
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production' || sameSite === 'none',
    sameSite,
    path: REFRESH_COOKIE_PATH,
  };
}

@Injectable()
export class RefreshCookie {
  private readonly options: CookieOptions;

  constructor(config: ConfigService<Env, true>) {
    this.options = refreshCookieOptions({
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
      AUTH_COOKIE_SAMESITE: config.get('AUTH_COOKIE_SAMESITE', { infer: true }),
    });
  }

  read(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const value = cookies?.[REFRESH_COOKIE_NAME];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  set(response: Response, token: string): void {
    response.cookie(REFRESH_COOKIE_NAME, token, {
      ...this.options,
      maxAge: REFRESH_TOKEN_TTL_MS,
    });
  }

  clear(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, this.options);
  }
}
