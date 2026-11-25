import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Lewati JwtAuthGuard global. Hanya untuk endpoint yang memang boleh dipanggil
 * tanpa login (health, login, refresh, lupa password).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
