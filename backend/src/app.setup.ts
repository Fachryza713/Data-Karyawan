import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { requestIdMiddleware } from './common/http/request-id.js';
import { API_PREFIX } from './config/api-prefix.js';
import type { Env } from './config/env.validation.js';
import { setupSwagger } from './config/swagger.js';
import { setupQueueDashboard } from './queue/queue-dashboard.js';

export { API_PREFIX };

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
  // Refresh token dibaca dari cookie httpOnly (endpoint /auth).
  app.use(cookieParser());
  app.enableCors({
    // Array (bukan string) supaya origin lain tidak mendapat header
    // Access-Control-Allow-Origin sama sekali.
    origin: [new URL(config.get('FRONTEND_URL', { infer: true })).origin],
    credentials: true,
  });

  // Bull Board /admin/queues (basic auth), hanya jika ENABLE_QUEUE_DASHBOARD=true.
  setupQueueDashboard(app);

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
