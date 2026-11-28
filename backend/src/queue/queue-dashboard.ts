import { createHash, timingSafeEqual } from 'node:crypto';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Queue } from 'bullmq';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Env } from '../config/env.validation.js';
import { ALL_QUEUES, QUEUE_DASHBOARD_PATH } from './queue.constants.js';

const REALM = 'HRIS Blue Rose Tech queues';

const sha256 = (text: string) => createHash('sha256').update(text).digest();

/** "user:password" dari header `Authorization: Basic ...`, atau null. */
export function parseBasicAuth(header: string | undefined): string | null {
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header?.trim() ?? '');
  if (!match) {
    return null;
  }
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  return decoded.includes(':') ? decoded : null;
}

/**
 * Middleware HTTP Basic auth. Kredensial dibandingkan lewat hash SHA-256
 * dengan timingSafeEqual: waktu perbandingan tidak bergantung pada berapa
 * karakter yang cocok, juga panjangnya.
 */
export function basicAuth(user: string, password: string): RequestHandler {
  const expected = sha256(`${user}:${password}`);
  return (req: Request, res: Response, next: NextFunction) => {
    const supplied = parseBasicAuth(req.headers.authorization);
    if (supplied !== null && timingSafeEqual(sha256(supplied), expected)) {
      next();
      return;
    }
    res
      .status(401)
      .setHeader('WWW-Authenticate', `Basic realm="${REALM}", charset="UTF-8"`)
      .type('text/plain')
      .send('Login dashboard antrean diperlukan');
  };
}

/**
 * Bull Board di /admin/queues (di luar prefix /api/v1), hanya jika
 * ENABLE_QUEUE_DASHBOARD=true. Semua route-nya, termasuk API dan file
 * statis, ada di belakang basic auth QUEUE_DASHBOARD_USER/PASSWORD.
 */
export function setupQueueDashboard(app: NestExpressApplication): boolean {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  if (!config.get('ENABLE_QUEUE_DASHBOARD', { infer: true })) {
    return false;
  }
  // Env schema mewajibkan keduanya saat dashboard aktif.
  const user = config.get('QUEUE_DASHBOARD_USER', { infer: true }) ?? '';
  const password =
    config.get('QUEUE_DASHBOARD_PASSWORD', { infer: true }) ?? '';

  const serverAdapter = new ExpressAdapter().setBasePath(QUEUE_DASHBOARD_PATH);
  createBullBoard({
    queues: ALL_QUEUES.map(
      (name) =>
        new BullMQAdapter(
          app.get<Queue>(getQueueToken(name), { strict: false }),
        ),
    ),
    serverAdapter,
    options: { uiConfig: { boardTitle: 'HRIS Queues' } },
  });
  app.use(
    QUEUE_DASHBOARD_PATH,
    basicAuth(user, password),
    serverAdapter.getRouter() as RequestHandler,
  );
  return true;
}
