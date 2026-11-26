import { AsyncLocalStorage } from 'node:async_hooks';

/** Siapa, dari mana, dan aksi apa: diisi AuditInterceptor per request. */
export type AuditRequestContext = {
  action: string;
  actorId: string | null;
  ip: string | null;
  userAgent: string | null;
};

const storage = new AsyncLocalStorage<AuditRequestContext>();

/**
 * Konteks audit request yang sedang berjalan. AsyncLocalStorage mengikuti
 * alur async (await, Promise) dari handler sampai service, jadi service tidak
 * perlu menerima actor/ip/userAgent sebagai parameter.
 */
export const auditContext = {
  run<T>(context: AuditRequestContext, fn: () => T): T {
    return storage.run(context, fn);
  },
  current(): AuditRequestContext | undefined {
    return storage.getStore();
  },
};
