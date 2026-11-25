import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

const SAFE_REQUEST_ID = /^[\w.-]{1,128}$/;

/**
 * Memakai X-Request-Id dari klien jika formatnya aman (masuk ke log dan
 * header respons), selain itu membuat UUID baru.
 */
export function resolveRequestId(incoming: unknown): string {
  return typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)
    ? incoming
    : randomUUID();
}

/**
 * Middleware Express yang dipasang paling awal, sebelum body parser dan guard,
 * supaya setiap respons (termasuk error) membawa request id yang sama dengan
 * log pino.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const id = resolveRequestId(req.header(REQUEST_ID_HEADER));
  req.id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
