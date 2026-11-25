import type { ConfigService } from '@nestjs/config';
import type { IncomingMessage } from 'node:http';
import type { Params } from 'nestjs-pino';
import {
  REQUEST_ID_HEADER,
  resolveRequestId,
} from '../common/http/request-id.js';
import type { Env } from './env.validation.js';

/**
 * Log JSON (pino) dengan request id yang sama dengan header X-Request-Id
 * dan field requestId di respons error.
 */
export function buildLoggerParams(config: ConfigService<Env, true>): Params {
  return {
    pinoHttp: {
      level: config.get('LOG_LEVEL', { infer: true }),
      // requestIdMiddleware sudah mengisi req.id; fallback untuk jaga-jaga.
      genReqId: (req: IncomingMessage) =>
        req.id ?? resolveRequestId(req.headers[REQUEST_ID_HEADER]),
      // Semua log di dalam request (termasuk dari service) membawa requestId.
      customProps: (req: IncomingMessage) => ({ requestId: req.id }),
      serializers: {
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie'],
        censor: '[REDACTED]',
      },
      // Healthcheck Docker memanggil /health tiap beberapa detik.
      autoLogging: { ignore: (req) => req.url === '/health' },
    },
  };
}
