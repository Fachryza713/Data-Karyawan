import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/auth/auth-user.js';
import {
  buildPageMeta,
  type PageMetaDto,
  pageToSkipTake,
} from '../../common/dto/pagination.dto.js';
import { parseDateOnly } from '../../common/validation/date-only.js';
import {
  normalizeEmail,
  normalizeNip,
} from '../../common/validation/formats.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { Role } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { INCLUDE_DELETED } from '../../prisma/soft-delete.extension.js';
import { diffSnapshots } from '../audit/audit-sanitize.js';
import { AuditService } from '../audit/audit.service.js';
import { generateOpaqueToken, hashPassword } from '../auth/auth.crypto.js';
import { PasswordResetService } from '../auth/password-reset.service.js';
import { RefreshTokenService } from '../auth/refresh-token.service.js';
import { LeaveBalanceService } from '../leave/leave-balance.service.js';
import type {
  CreateEmployeeDto,
  UpdateEmployeeDto,
} from './dto/employee-request.dto.js';
import type {
  CreateEmployeeResponseDto,
  EmployeeResponseDto,
} from './dto/employee-response.dto.js';
import type { ListEmployeesQueryDto } from './dto/list-employees-query.dto.js';
import { EmployeeInvitationService } from './employee-invitation.service.js';
import {
  definedOnly,
  EMPLOYEE_SELECT,
  type EmployeeRow,
  type EmployeeSnapshot,
  employeeSnapshot,
} from './employee.select.js';
import { EmployeeSerializer } from './employee.serializer.js';
import { EmployeeMessages, INVITATION_TTL_MS } from './employees.constants.js';

const ENTITY = 'Employee';

export type EmployeeListResult = {
  data: EmployeeResponseDto[];
  meta: PageMetaDto;
};

type OrganizationRefs = {
  departmentId?: string;
  positionId?: string;
  officeLocationId?: string;
  shiftId?: string;
};

/**
 * Filter daftar karyawan. Default hanya yang aktif (deletedAt null);
 * status=inactive hanya yang sudah di-soft delete.
 */
export function buildEmployeeListWhere(
  query: Pick<
    ListEmployeesQueryDto,
    'search' | 'departmentId' | 'positionId' | 'status'
  >,
): Prisma.EmployeeWhereInput {
  const { search } = query;
  return {
    deletedAt: query.status === 'inactive' ? { not: null } : null,
    ...(query.departmentId && { departmentId: query.departmentId }),
    ...(query.positionId && { positionId: query.positionId }),
    ...(search && {
      OR: [
        { fullName: { contains: search, mode: 'insensitive' } },
        { nip: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ],
    }),
  };
}

/** Kolom Employee yang diubah, dari field snapshot yang berubah. */
function toEmployeeUpdate(
  changed: Partial<EmployeeSnapshot>,
): Prisma.EmployeeUncheckedUpdateInput {
  const {
    birthDate,
    joinDate,
    // Bukan kolom Employee (milik User) atau tidak diubah lewat update biasa.
    email: _email,
    role: _role,
    isActive: _isActive,
    photoKey: _photoKey,
    deletedAt: _deletedAt,
    ...columns
  } = changed;
  return {
    ...columns,
    ...(birthDate !== undefined && {
      birthDate: birthDate === null ? null : parseDateOnly(birthDate),
    }),
    ...(joinDate !== undefined && { joinDate: parseDateOnly(joinDate) }),
  };
}

/** Kelola data karyawan oleh HR. */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly serializer: EmployeeSerializer,
    private readonly passwordReset: PasswordResetService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly invitation: EmployeeInvitationService,
    private readonly leaveBalances: LeaveBalanceService,
  ) {}

  async list(query: ListEmployeesQueryDto): Promise<EmployeeListResult> {
    const where = buildEmployeeListWhere(query);
    const orderBy = [
      { [query.sort]: query.order },
      // Urutan stabil antarhalaman jika nilai sort sama.
      { id: 'asc' },
    ] as Prisma.EmployeeOrderByWithRelationInput[];
    const [rows, total] = await Promise.all([
      this.prisma.client.employee.findMany({
        where,
        orderBy,
        ...pageToSkipTake(query.page, query.limit),
        select: EMPLOYEE_SELECT,
      }),
      this.prisma.client.employee.count({ where }),
    ]);
    return {
      data: await this.serializer.toDtos(rows),
      meta: buildPageMeta(query.page, query.limit, total),
    };
  }

  /** Detail karyawan, termasuk yang sudah nonaktif (riwayat tetap bisa dilihat). */
  async findOne(id: string): Promise<EmployeeResponseDto> {
    const row = await this.prisma.client.employee.findUnique({
      where: { id, ...INCLUDE_DELETED },
      select: EMPLOYEE_SELECT,
    });
    if (!row) {
      throw new NotFoundException(EmployeeMessages.notFound);
    }
    return this.serializer.toDto(row);
  }

  /**
   * Buat User + Employee (beserta saldo cuti tahun berjalan) dalam satu
   * transaksi, lalu kirim email undangan berisi link set password. Akun baru diberi password acak yang tidak
   * diketahui siapa pun, jadi baru bisa login setelah link undangan dipakai.
   */
  async create(dto: CreateEmployeeDto): Promise<CreateEmployeeResponseDto> {
    const email = normalizeEmail(dto.email);
    const nip = normalizeNip(dto.nip);
    await this.assertIdentityAvailable({ nip, email });
    await this.assertOrganization(dto);

    const passwordHash = await hashPassword(generateOpaqueToken());
    const { row, token } = await this.prisma.client.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, role: dto.role ?? Role.EMPLOYEE },
        select: { id: true },
      });
      const created = await tx.employee.create({
        data: {
          userId: user.id,
          nip,
          fullName: dto.fullName,
          phone: dto.phone ?? null,
          gender: dto.gender ?? null,
          birthDate: dto.birthDate ? parseDateOnly(dto.birthDate) : null,
          departmentId: dto.departmentId,
          positionId: dto.positionId,
          officeLocationId: dto.officeLocationId,
          shiftId: dto.shiftId,
          joinDate: parseDateOnly(dto.joinDate),
          employmentStatus: dto.employmentStatus,
        },
        select: EMPLOYEE_SELECT,
      });
      await this.leaveBalances.ensureForEmployee(created.id, tx);
      const inviteToken = await this.passwordReset.issueToken(
        user.id,
        INVITATION_TTL_MS,
        tx,
      );
      await this.audit.recordChange(
        {
          entity: ENTITY,
          entityId: created.id,
          after: employeeSnapshot(created),
        },
        tx,
      );
      return { row: created, token: inviteToken };
    });

    // Dikirim setelah commit: email tidak pernah terkirim untuk akun yang batal dibuat.
    const invitationSent = await this.invitation.send(
      { email, fullName: row.fullName },
      token,
    );
    return { ...(await this.serializer.toDto(row)), invitationSent };
  }

  /** Ubah data karyawan aktif. Hanya field yang benar-benar berubah yang ditulis dan dicatat. */
  async update(
    id: string,
    dto: UpdateEmployeeDto,
  ): Promise<EmployeeResponseDto> {
    const current = await this.findActiveRow(id);
    const before = employeeSnapshot(current);
    const requested = definedOnly({
      email: dto.email === undefined ? undefined : normalizeEmail(dto.email),
      nip: dto.nip === undefined ? undefined : normalizeNip(dto.nip),
      fullName: dto.fullName,
      phone: dto.phone,
      gender: dto.gender,
      birthDate: dto.birthDate,
      departmentId: dto.departmentId,
      positionId: dto.positionId,
      officeLocationId: dto.officeLocationId,
      shiftId: dto.shiftId,
      joinDate: dto.joinDate,
      employmentStatus: dto.employmentStatus,
    });
    const diff = diffSnapshots(before, { ...before, ...requested });
    if (!diff) {
      return this.serializer.toDto(current);
    }

    const changed = diff.after;
    await this.assertIdentityAvailable(
      { nip: changed.nip, email: changed.email },
      { employeeId: current.id, userId: current.userId },
    );
    const departmentOrPosition =
      changed.departmentId !== undefined || changed.positionId !== undefined;
    await this.assertOrganization({
      // Jabatan dicek terhadap departemen hasil akhir (baru atau yang sekarang).
      ...(departmentOrPosition && {
        departmentId: changed.departmentId ?? current.departmentId,
        positionId: changed.positionId ?? current.positionId,
      }),
      officeLocationId: changed.officeLocationId,
      shiftId: changed.shiftId,
    });

    const row = await this.prisma.client.$transaction(async (tx) => {
      if (changed.email !== undefined) {
        await tx.user.update({
          where: { id: current.userId },
          data: { email: changed.email },
        });
      }
      const updated = await tx.employee.update({
        where: { id },
        data: toEmployeeUpdate(changed),
        select: EMPLOYEE_SELECT,
      });
      await this.audit.recordChange(
        { entity: ENTITY, entityId: id, ...diff },
        tx,
      );
      return updated;
    });
    return this.serializer.toDto(row);
  }

  /**
   * Soft delete: isi deletedAt, nonaktifkan akun, cabut semua refresh token.
   * Data dan riwayatnya tetap tersimpan dan bisa dipulihkan (restore).
   */
  async remove(id: string, actor: AuthUser): Promise<void> {
    const employee = await this.findStatus(id);
    if (employee.deletedAt) {
      throw new ConflictException(EmployeeMessages.alreadyInactive);
    }
    if (employee.userId === actor.id) {
      throw new BadRequestException(EmployeeMessages.cannotDeactivateSelf);
    }

    const deletedAt = new Date();
    await this.prisma.client.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: { deletedAt },
        select: { id: true },
      });
      await tx.user.update({
        where: { id: employee.userId },
        data: { isActive: false },
      });
      const revokedSessions = await this.refreshTokens.revokeAllForUser(
        employee.userId,
        tx,
      );
      await this.audit.recordChange(
        {
          entity: ENTITY,
          entityId: id,
          before: { deletedAt: null, isActive: employee.user.isActive },
          after: { deletedAt, isActive: false, revokedSessions },
        },
        tx,
      );
    });
  }

  /** Batalkan soft delete: karyawan aktif lagi dan bisa login. */
  async restore(id: string): Promise<EmployeeResponseDto> {
    const employee = await this.findStatus(id);
    if (!employee.deletedAt) {
      throw new ConflictException(EmployeeMessages.stillActive);
    }

    const row = await this.prisma.client.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: employee.userId },
        data: { isActive: true },
      });
      const restored = await tx.employee.update({
        where: { id, deletedAt: { not: null } },
        data: { deletedAt: null },
        select: EMPLOYEE_SELECT,
      });
      await this.audit.recordChange(
        {
          entity: ENTITY,
          entityId: id,
          before: {
            deletedAt: employee.deletedAt,
            isActive: employee.user.isActive,
          },
          after: { deletedAt: null, isActive: true },
        },
        tx,
      );
      return restored;
    });
    return this.serializer.toDto(row);
  }

  private async findActiveRow(id: string): Promise<EmployeeRow> {
    const row = await this.prisma.client.employee.findUnique({
      where: { id },
      select: EMPLOYEE_SELECT,
    });
    if (!row) {
      throw new NotFoundException(EmployeeMessages.notFound);
    }
    return row;
  }

  private async findStatus(id: string) {
    const employee = await this.prisma.client.employee.findUnique({
      where: { id, ...INCLUDE_DELETED },
      select: {
        id: true,
        userId: true,
        deletedAt: true,
        user: { select: { isActive: true } },
      },
    });
    if (!employee) {
      throw new NotFoundException(EmployeeMessages.notFound);
    }
    return employee;
  }

  /**
   * NIP dan email harus unik. NIP dicek terhadap semua karyawan, termasuk
   * yang nonaktif, karena karyawan nonaktif bisa dipulihkan.
   */
  private async assertIdentityAvailable(
    identity: { nip?: string; email?: string },
    self?: { employeeId: string; userId: string },
  ): Promise<void> {
    const [nipOwner, emailOwner] = await Promise.all([
      identity.nip
        ? this.prisma.client.employee.findFirst({
            where: {
              nip: identity.nip,
              ...INCLUDE_DELETED,
              ...(self && { id: { not: self.employeeId } }),
            },
            select: { id: true },
          })
        : null,
      identity.email
        ? this.prisma.client.user.findFirst({
            where: {
              email: identity.email,
              ...(self && { id: { not: self.userId } }),
            },
            select: { id: true },
          })
        : null,
    ]);
    if (nipOwner) {
      throw new ConflictException(EmployeeMessages.nipTaken);
    }
    if (emailOwner) {
      throw new ConflictException(EmployeeMessages.emailTaken);
    }
  }

  /**
   * Data master yang dirujuk harus ada, dan jabatan harus milik departemen
   * yang dipilih. Hanya ref yang diisi yang dicek.
   */
  private async assertOrganization(refs: OrganizationRefs): Promise<void> {
    const db = this.prisma.client;
    const [department, position, officeLocation, shift] = await Promise.all([
      refs.departmentId
        ? db.department.findUnique({
            where: { id: refs.departmentId },
            select: { id: true },
          })
        : undefined,
      refs.positionId
        ? db.position.findUnique({
            where: { id: refs.positionId },
            select: { departmentId: true },
          })
        : undefined,
      refs.officeLocationId
        ? db.officeLocation.findUnique({
            where: { id: refs.officeLocationId },
            select: { id: true },
          })
        : undefined,
      refs.shiftId
        ? db.shift.findUnique({
            where: { id: refs.shiftId },
            select: { id: true },
          })
        : undefined,
    ]);
    if (department === null) {
      throw new BadRequestException(EmployeeMessages.departmentNotFound);
    }
    if (position === null) {
      throw new BadRequestException(EmployeeMessages.positionNotFound);
    }
    if (
      position &&
      refs.departmentId &&
      position.departmentId !== refs.departmentId
    ) {
      throw new BadRequestException(EmployeeMessages.positionOutsideDepartment);
    }
    if (officeLocation === null) {
      throw new BadRequestException(EmployeeMessages.officeLocationNotFound);
    }
    if (shift === null) {
      throw new BadRequestException(EmployeeMessages.shiftNotFound);
    }
  }
}
