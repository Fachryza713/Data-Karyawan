import { createHash, randomBytes } from 'node:crypto';
import { argon2id, hash, verify } from 'argon2';

/** Token opaque 256-bit acak (base64url, 43 karakter). */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Pola token dari generateOpaqueToken, untuk validasi DTO. */
export const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * SHA-256 hex dari token. Database hanya menyimpan hash ini, jadi isi tabel
 * yang bocor tidak bisa dipakai sebagai token.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, { type: argon2id });
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // Hash rusak/format lain: anggap salah, jangan bocorkan sebagai 500.
    return false;
  }
}
