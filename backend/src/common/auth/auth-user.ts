import type { Request } from 'express';
import type { Role } from '../../generated/prisma/enums.js';

/** User yang sedang login, diambil dari access token (bukan dari parameter). */
export type AuthUser = {
  id: string;
  role: Role;
  /** Null jika akun belum punya data karyawan. */
  employeeId: string | null;
};

/** Isi access token JWT (selain iat/exp). */
export type AccessTokenPayload = {
  sub: string;
  role: Role;
  employeeId: string | null;
};

export type AuthenticatedRequest = Request & { user?: AuthUser };
