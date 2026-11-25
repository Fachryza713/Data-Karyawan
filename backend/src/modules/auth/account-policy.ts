/** Field minimal untuk menilai apakah akun boleh punya sesi. */
export type AccountState = {
  isActive: boolean;
  employee: { deletedAt: Date | null } | null;
};

/**
 * Akun boleh login, refresh, dan reset password hanya jika user aktif dan
 * data karyawannya (jika ada) belum di-soft delete. Karyawan nonaktif
 * "tidak bisa login" (PRD US-11).
 */
export function canHoldSession(account: AccountState): boolean {
  return account.isActive && account.employee?.deletedAt == null;
}
