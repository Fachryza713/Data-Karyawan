import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  type AppTransactionClient,
  PrismaService,
} from '../../prisma/prisma.service.js';

export type AuditEntry = {
  /** Null untuk aksi tanpa user yang dikenal (misalnya login email asing). */
  actorId: string | null;
  /** Contoh: auth.login_success, auth.password_reset. */
  action: string;
  entity: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
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
        before: entry.before,
        after: entry.after,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  }
}
