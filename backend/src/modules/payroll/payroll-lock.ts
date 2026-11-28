import type { AppTransactionClient } from '../../prisma/prisma.service.js';
import { periodLockKey } from './payroll.constants.js';

/**
 * Kunci satu periode payroll sampai transaksi selesai
 * (pg_advisory_xact_lock, dilepas otomatis saat commit/rollback).
 *
 * Semua operasi yang mengubah periode atau slipnya (run, ubah slip,
 * finalize, mark-paid, reopen) mengambil kunci yang sama, jadi berjalan
 * berurutan: run yang paralel tidak menggandakan slip, dan slip tidak bisa
 * diubah di tengah finalize.
 */
export async function lockPayrollPeriod(
  tx: AppTransactionClient,
  periodId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${periodLockKey(periodId)}, 0))`;
}
