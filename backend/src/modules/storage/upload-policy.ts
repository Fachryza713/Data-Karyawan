import { BadRequestException } from '@nestjs/common';

/** Aturan file yang boleh diunggah untuk satu kebutuhan (avatar, lampiran). */
export type UploadPolicy = {
  allowedContentTypes: readonly string[];
  maxBytes: number;
  /** Untuk pesan error, contoh "JPG/PNG". */
  typeLabel: string;
};

const MB = 1024 * 1024;

/** Foto profil: JPG/PNG maksimal 2 MB (PRD US-12). */
export const AVATAR_UPLOAD_POLICY: UploadPolicy = {
  allowedContentTypes: ['image/jpeg', 'image/png'],
  maxBytes: 2 * MB,
  typeLabel: 'JPG/PNG',
};

/** Lampiran pengajuan cuti (surat dokter, dll): JPG/PNG/PDF maksimal 2 MB (PRD US-08). */
export const LEAVE_ATTACHMENT_UPLOAD_POLICY: UploadPolicy = {
  allowedContentTypes: ['image/jpeg', 'image/png', 'application/pdf'],
  maxBytes: 2 * MB,
  typeLabel: 'JPG/PNG/PDF',
};

export type DeclaredFile = {
  contentType: string;
  /** Ukuran file dalam byte, dikirim klien sebelum upload. */
  size: number;
};

export function formatBytes(bytes: number): string {
  return bytes % MB === 0 ? `${bytes / MB} MB` : `${bytes} byte`;
}

/**
 * Cek tipe dan ukuran file sebelum presigned URL dibuat. Presigned POST
 * juga mengunci Content-Type dan batas ukuran yang sama, jadi storage menolak
 * upload yang menyimpang dari yang dideklarasikan di sini.
 */
export function assertUploadAllowed(
  policy: UploadPolicy,
  file: DeclaredFile,
): void {
  if (!policy.allowedContentTypes.includes(file.contentType)) {
    throw new BadRequestException(
      `Tipe file harus ${policy.typeLabel} (${policy.allowedContentTypes.join(', ')})`,
    );
  }
  if (!Number.isInteger(file.size) || file.size < 1) {
    throw new BadRequestException('Ukuran file tidak valid');
  }
  if (file.size > policy.maxBytes) {
    throw new BadRequestException(
      `Ukuran file maksimal ${formatBytes(policy.maxBytes)}`,
    );
  }
}

/** Jumlah byte awal file yang cukup untuk mengenali JPG dan PNG. */
export const IMAGE_SIGNATURE_LENGTH = 8;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((byte, index) => bytes[index] === byte);

/**
 * Tipe gambar dari isi file (magic bytes), bukan dari header Content-Type
 * yang dikirim klien. Null jika bukan JPG atau PNG.
 */
export function detectImageType(
  bytes: Uint8Array,
): 'image/jpeg' | 'image/png' | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png';
  if (startsWith(bytes, JPEG_SIGNATURE)) return 'image/jpeg';
  return null;
}
