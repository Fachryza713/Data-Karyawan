import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import type { AuthenticatedRequest } from '../../common/auth/auth-user.js';
import { clientMetaFrom } from '../../common/decorators/client-meta.decorator.js';
import { type AuditRequestContext, auditContext } from './audit-context.js';
import { AUDIT_ACTION_KEY } from './audit.decorator.js';

/**
 * Interceptor global. Untuk endpoint ber-@Audit, handler dijalankan di dalam
 * konteks audit (aksi, actor, IP, user agent) yang dibaca
 * AuditService.recordChange. Endpoint lain tidak tersentuh.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<string | undefined>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );
    if (!action || context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const store: AuditRequestContext = {
      action,
      actorId: request.user?.id ?? null,
      ...clientMetaFrom(request),
    };
    // Handler baru jalan saat di-subscribe, jadi subscribe di dalam run().
    return new Observable((subscriber) =>
      auditContext.run(store, () => next.handle().subscribe(subscriber)),
    );
  }
}
