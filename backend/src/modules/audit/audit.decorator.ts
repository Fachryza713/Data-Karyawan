import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'audit:action';

/**
 * Tandai endpoint yang mengubah data, contoh `@Audit('employee.update')`.
 *
 * AuditInterceptor lalu menyiapkan konteks audit (aksi, actor dari JWT, IP,
 * user agent). Service mencatat perubahannya dengan
 * `audit.recordChange({ entity, entityId, before, after }, tx)` di dalam
 * transaksi yang sama dengan perubahan datanya, jadi log tidak tertulis untuk
 * perubahan yang gagal, dan perubahan tidak tersimpan tanpa log.
 */
export const Audit = (action: string) => SetMetadata(AUDIT_ACTION_KEY, action);
