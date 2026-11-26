import { toDateOnly } from '../../common/validation/date-only.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  EmploymentStatus,
  Gender,
  Role,
} from '../../generated/prisma/enums.js';

/**
 * Kolom karyawan yang dibaca modul ini. Select eksplisit: passwordHash dan
 * token tidak pernah ikut terbaca dari database.
 */
export const EMPLOYEE_SELECT = {
  id: true,
  userId: true,
  nip: true,
  fullName: true,
  phone: true,
  gender: true,
  birthDate: true,
  photoKey: true,
  departmentId: true,
  positionId: true,
  officeLocationId: true,
  shiftId: true,
  joinDate: true,
  employmentStatus: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { email: true, role: true, isActive: true } },
  department: { select: { id: true, name: true } },
  position: { select: { id: true, name: true } },
  officeLocation: { select: { id: true, name: true } },
  shift: {
    select: {
      id: true,
      name: true,
      startTime: true,
      endTime: true,
      lateToleranceMin: true,
    },
  },
} as const satisfies Prisma.EmployeeSelect;

export type EmployeeRow = Prisma.EmployeeGetPayload<{
  select: typeof EMPLOYEE_SELECT;
}>;

/**
 * Bentuk datar karyawan untuk audit log dan pembanding perubahan. Tanggal
 * kalender sebagai "YYYY-MM-DD", supaya bisa dibandingkan dengan input DTO.
 */
export type EmployeeSnapshot = {
  email: string;
  role: Role;
  isActive: boolean;
  nip: string;
  fullName: string;
  phone: string | null;
  gender: Gender | null;
  birthDate: string | null;
  joinDate: string;
  employmentStatus: EmploymentStatus;
  departmentId: string;
  positionId: string;
  officeLocationId: string;
  shiftId: string;
  photoKey: string | null;
  deletedAt: string | null;
};

export function employeeSnapshot(row: EmployeeRow): EmployeeSnapshot {
  return {
    email: row.user.email,
    role: row.user.role,
    isActive: row.user.isActive,
    nip: row.nip,
    fullName: row.fullName,
    phone: row.phone,
    gender: row.gender,
    birthDate: row.birthDate ? toDateOnly(row.birthDate) : null,
    joinDate: toDateOnly(row.joinDate),
    employmentStatus: row.employmentStatus,
    departmentId: row.departmentId,
    positionId: row.positionId,
    officeLocationId: row.officeLocationId,
    shiftId: row.shiftId,
    photoKey: row.photoKey,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

/** Buang key bernilai undefined (field yang tidak dikirim). Null dipertahankan. */
export function definedOnly<T extends Record<string, unknown>>(
  values: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
