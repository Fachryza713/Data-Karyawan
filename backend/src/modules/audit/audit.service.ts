import { Injectable } from '@nestjs/common';
import {
  type AppTransactionClient,
  PrismaService,
} from '../../prisma/prisma.service.js';
import { auditContext } from './audit-context.js';
import { sanitizeForAudit } from './audit-sanitize.js';

export type AuditEntry = {
  /** Null untuk aksi tanpa user yang dikenal (misalnya login email asing). */
  actorId: string | null;
  /** Contoh: auth.login_success, auth.password_reset. */
  action: string;
  entity: string;
  entityId: string;
  /** Disaring sanitizeForAudit: password, hash, dan token tidak ikut tersimpan. */
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
};

/** Perubahan data dari service; aksi, actor, IP, dan user agent dari @Audit. */
export type AuditChange = {
  /** Nama model, contoh Employee. */
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
};

/** Penulis AuditLog. Kirim `tx` supaya log ikut transaksi perubahan datanya. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx?: AppTransactionClient): Promise<void> {
    const db = tx ?? this.prisma.client;
    await db.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before: sanitizeForAudit(entry.before),
        after: sanitizeForAudit(entry.after),
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  }

  /**
   * Catat perubahan dari endpoint ber-@Audit. Aksi, actor, IP, dan user agent
   * diambil dari konteks request (AuditInterceptor). Melempar error jika
   * dipanggil di luar endpoint ber-@Audit, supaya log tanpa actor tidak
   * tertulis diam-diam.
   */
  async recordChange(
    change: AuditChange,
    tx?: AppTransactionClient,
  ): Promise<void> {
    const context = auditContext.current();
    if (!context) {
      throw new Error(
        `Audit ${change.entity} dicatat di luar endpoint @Audit(...)`,
      );
    }
    await this.record({ ...context, ...change }, tx);
  }
}
