/**
 * Format data yang dipakai bersama oleh DTO, seed, dan service.
 * Pola di sini sama dengan CHECK constraint di migrasi core_schema.
 */

/** NIP karyawan: BRT-YYYY-NNNN, contoh BRT-2024-0001. */
export const NIP_PATTERN = /^BRT-\d{4}-\d{4}$/;

/**
 * Nomor telepon: boleh diawali +, lalu angka, spasi, atau strip (8-20
 * karakter). Sama dengan aturan update_my_profile di versi Supabase.
 */
export const PHONE_PATTERN = /^\+?[0-9][0-9 -]{7,19}$/;

/** Panjang maksimal nama lengkap karyawan. */
export const FULL_NAME_MAX_LENGTH = 100;

/**
 * Nomor WhatsApp untuk link wa.me: 62 lalu nomor tanpa 0 di depan,
 * total 10-14 digit, tanpa +, spasi, atau strip. Contoh 6281234567890.
 * Sama dengan CHECK company_settings_contact_valid di versi Supabase.
 */
export const WHATSAPP_PATTERN = /^62[1-9]\d{7,11}$/;

/**
 * Email kontak yang dipakai langsung di link mailto:, jadi lebih ketat
 * dari IsEmail (tanpa ?, &, spasi). Sama dengan versi Supabase.
 */
export const CONTACT_EMAIL_PATTERN =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

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
