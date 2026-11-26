import { randomUUID } from 'node:crypto';

/** Link undangan set password untuk karyawan baru: 72 jam, sekali pakai. */
export const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

export const EmployeeAuditActions = {
  create: 'employee.create',
  update: 'employee.update',
  delete: 'employee.delete',
  restore: 'employee.restore',
  selfUpdate: 'employee.self_update',
  photoUpdate: 'employee.photo_update',
} as const;

export const EmployeeMessages = {
  notFound: 'Karyawan tidak ditemukan',
  noEmployeeRecord: 'Akun ini belum punya data karyawan',
  nipTaken: 'NIP sudah dipakai karyawan lain (termasuk karyawan nonaktif)',
  emailTaken: 'Email sudah dipakai akun lain',
  departmentNotFound: 'Departemen tidak ditemukan',
  positionNotFound: 'Jabatan tidak ditemukan',
  positionOutsideDepartment:
    'Jabatan tidak termasuk dalam departemen yang dipilih',
  officeLocationNotFound: 'Lokasi kantor tidak ditemukan',
  shiftNotFound: 'Shift tidak ditemukan',
  alreadyInactive: 'Karyawan sudah nonaktif',
  stillActive: 'Karyawan masih aktif',
  cannotDeactivateSelf: 'Anda tidak bisa menonaktifkan akun sendiri',
  invalidPhotoKey: 'Key foto tidak valid',
  photoNotUploaded:
    'Foto belum diunggah atau link upload sudah kedaluwarsa. Minta link upload baru.',
  invalidPhotoFile: 'Foto harus gambar JPG/PNG maksimal 2 MB',
} as const;

const AVATAR_SUFFIX =
  /^avatar-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const avatarPrefix = (employeeId: string) => `employees/${employeeId}/`;

/** Object key foto profil baru: employees/<id>/avatar-<uuid>. */
export function newAvatarKey(employeeId: string): string {
  return `${avatarPrefix(employeeId)}avatar-${randomUUID()}`;
}

/** Key foto milik karyawan ini (folder sendiri, format dari newAvatarKey). */
export function isAvatarKeyOf(employeeId: string, key: string): boolean {
  const prefix = avatarPrefix(employeeId);
  return key.startsWith(prefix) && AVATAR_SUFFIX.test(key.slice(prefix.length));
}
