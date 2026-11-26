import { Prisma } from '../../generated/prisma/client.js';

/**
 * Key yang tidak boleh masuk audit log: password, hash, token, secret.
 * Dicek per key di semua tingkat objek, tidak peka huruf besar/kecil
 * (passwordHash, tokenHash, refreshToken, accessToken, ...).
 */
const SENSITIVE_KEY = /password|token|secret|hash/i;

export function isSensitiveAuditKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

type JsonValue = Prisma.InputJsonValue | null;

function toAuditJson(value: unknown): JsonValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Prisma.Decimal.isDecimal(value)) {
    // Uang disimpan sebagai teks supaya presisinya tidak hilang.
    return value.toString();
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(toAuditJson);
  }
  if (typeof value === 'object') {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined && !isSensitiveAuditKey(key)) {
        result[key] = toAuditJson(item);
      }
    }
    return result;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  // function, symbol: bukan data.
  return null;
}

/**
 * Ubah before/after menjadi JSON yang aman disimpan: key sensitif dibuang,
 * Date menjadi ISO string, Decimal menjadi teks. Null/undefined di tingkat
 * atas menjadi undefined (kolom JSON dibiarkan NULL).
 */
export function sanitizeForAudit(
  value: unknown,
): Prisma.InputJsonValue | undefined {
  return toAuditJson(value) ?? undefined;
}

export type SnapshotDiff<T> = { before: Partial<T>; after: Partial<T> };

/**
 * Field yang nilainya berbeda antara dua snapshot. Null jika tidak ada yang
 * berubah. Nilai dibandingkan dalam bentuk JSON-nya (Date dan Decimal aman).
 */
export function diffSnapshots<T extends Record<string, unknown>>(
  before: T,
  after: T,
): SnapshotDiff<T> | null {
  const changedBefore: Partial<T> = {};
  const changedAfter: Partial<T> = {};
  const keys = new Set<keyof T>([
    ...Object.keys(before),
    ...Object.keys(after),
  ]);
  for (const key of keys) {
    const oldValue = JSON.stringify(toAuditJson(before[key]));
    const newValue = JSON.stringify(toAuditJson(after[key]));
    if (oldValue !== newValue) {
      changedBefore[key] = before[key];
      changedAfter[key] = after[key];
    }
  }
  return Object.keys(changedAfter).length > 0
    ? { before: changedBefore, after: changedAfter }
    : null;
}
