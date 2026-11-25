import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** IP dan user agent klien, untuk sesi login dan audit log. */
export type ClientMeta = {
  ip: string | null;
  userAgent: string | null;
};

const MAX_USER_AGENT_LENGTH = 512;

export function clientMetaFrom(request: Request): ClientMeta {
  const userAgent = request.headers['user-agent'];
  return {
    ip: request.ip ?? null,
    userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
  };
}

export const RequestClientMeta = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ClientMeta =>
    clientMetaFrom(context.switchToHttp().getRequest<Request>()),
);
