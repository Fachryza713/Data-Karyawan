import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { requestIdMiddleware } from './common/http/request-id.js';
import type { Env } from './config/env.validation.js';
import { setupSwagger } from './config/swagger.js';

export const API_PREFIX = 'api/v1';

/**
 * Konfigurasi global aplikasi. Dipakai main.ts dan test e2e supaya
 * perilakunya sama persis.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Paling awal: request id harus ada sebelum body parser, guard, atau
  // error apa pun terjadi.
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.enableCors({
    // Array (bukan string) supaya origin lain tidak mendapat header
    // Access-Control-Allow-Origin sama sekali.
    origin: [new URL(config.get('FRONTEND_URL', { infer: true })).origin],
    credentials: true,
  });

  // /health tetap di root supaya mudah dipakai healthcheck Docker/load balancer.
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  setupSwagger(app);
}
