/**
 * Format data yang dipakai bersama oleh DTO, seed, dan service.
 * Pola di sini sama dengan CHECK constraint di migrasi core_schema.
 */

/** NIP karyawan: BRT-YYYY-NNNN, contoh BRT-2024-0001. */
export const NIP_PATTERN = /^BRT-\d{4}-\d{4}$/;

/** Jam 24 jam "HH:mm" (WIB), contoh 08:30. */
export const TIME_HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Rapikan input NIP: buang spasi di tepi, jadikan huruf besar. */
export function normalizeNip(nip: string): string {
  return nip.trim().toUpperCase();
}

export function isValidNip(nip: string): boolean {
  return NIP_PATTERN.test(nip);
}

/** Email disimpan huruf kecil supaya unik tanpa membedakan kapital. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidTimeHHmm(time: string): boolean {
  return TIME_HHMM_PATTERN.test(time);
}

/**
 * Shift valid jika kedua jam berformat HH:mm dan jam pulang setelah jam
 * masuk (shift lintas tengah malam belum didukung). Perbandingan string
 * aman karena formatnya selalu dua digit.
 */
export function isValidShiftWindow(
  startTime: string,
  endTime: string,
): boolean {
  return (
    isValidTimeHHmm(startTime) &&
    isValidTimeHHmm(endTime) &&
    endTime > startTime
  );
}
