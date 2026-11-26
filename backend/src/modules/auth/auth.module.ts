import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { RedisThrottlerStorage } from '../../common/throttler/redis-throttler.storage.js';
import type { Env } from '../../config/env.validation.js';
import { REDIS_CLIENT } from '../../redis/redis.module.js';
import { AuthController } from './auth.controller.js';
import { ACCESS_TOKEN_TTL_SECONDS } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import {
  AuthThrottlerGuard,
  FORGOT_PASSWORD_THROTTLER,
  LOGIN_THROTTLER,
} from './guards/auth-throttler.guard.js';
import { PasswordResetService } from './password-reset.service.js';
import { RefreshCookie } from './refresh-cookie.js';
import { RefreshTokenService } from './refresh-token.service.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        },
        // Tolak token dengan algoritma lain (misalnya "none").
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    // Throttler hanya dipakai lewat AuthThrottlerGuard di endpoint auth,
    // bukan guard global. Hitungan disimpan di Redis.
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [
          { name: LOGIN_THROTTLER, ttl: 60_000, limit: 5 },
          { name: FORGOT_PASSWORD_THROTTLER, ttl: 3_600_000, limit: 3 },
        ],
        storage: new RedisThrottlerStorage(redis),
        errorMessage: 'Terlalu banyak percobaan. Coba lagi nanti.',
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RefreshTokenService,
    PasswordResetService,
    RefreshCookie,
    AuthThrottlerGuard,
    // Urutan penting: autentikasi dulu, baru cek role.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  // Dipakai modul karyawan: undangan set password dan cabut sesi saat nonaktif.
  exports: [PasswordResetService, RefreshTokenService],
})
export class AuthModule {}
