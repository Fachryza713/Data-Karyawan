import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ACTIVE_EMPLOYEE } from '../../prisma/soft-delete.extension.js';
import { diffSnapshots } from '../audit/audit-sanitize.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  CreatePositionDto,
  ListPositionsQueryDto,
  PositionResponseDto,
  UpdatePositionDto,
} from './dto/organization.dto.js';
import { OrganizationMessages } from './organization.constants.js';

const ENTITY = 'Position';

const POSITION_SELECT = {
  id: true,
  name: true,
  departmentId: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true } },
  _count: { select: { employees: { where: ACTIVE_EMPLOYEE } } },
} as const satisfies Prisma.PositionSelect;

type PositionRow = Prisma.PositionGetPayload<{
  select: typeof POSITION_SELECT;
}>;

function toDto(row: PositionRow): PositionResponseDto {
  return {
    id: row.id,
    name: row.name,
    department: row.department,
    employeeCount: row._count.employees,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class PositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListPositionsQueryDto): Promise<PositionResponseDto[]> {
    const rows = await this.prisma.client.position.findMany({
      where: query.departmentId ? { departmentId: query.departmentId } : {},
      orderBy: [{ department: { name: 'asc' } }, { name: 'asc' }],
      select: POSITION_SELECT,
    });
    return rows.map(toDto);
  }

  async findOne(id: string): Promise<PositionResponseDto> {
    return toDto(await this.findRow(id));
  }

  async create(dto: CreatePositionDto): Promise<PositionResponseDto> {
    await this.assertDepartmentExists(dto.departmentId);
    await this.assertNameAvailable(dto.departmentId, dto.name);

    const row = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.position.create({
        data: { name: dto.name, departmentId: dto.departmentId },
        select: POSITION_SELECT,
      });
      await this.audit.recordChange(
        {
          entity: ENTITY,
          entityId: created.id,
          after: { name: created.name, departmentId: created.departmentId },
        },
        tx,
      );
      return created;
    });
    return toDto(row);
  }

  /**
   * Ubah nama atau departemen. Pindah departemen ditolak 409 jika jabatan
   * masih dipakai karyawan (termasuk nonaktif), karena jabatan karyawan harus
   * selalu milik departemennya.
   */
  async update(
    id: string,
    dto: UpdatePositionDto,
  ): Promise<PositionResponseDto> {
    const current = await this.findRow(id);
    const before = { name: current.name, departmentId: current.departmentId };
    const diff = diffSnapshots(before, {
      name: dto.name ?? current.name,
      departmentId: dto.departmentId ?? current.departmentId,
    });
    if (!diff) {
      return toDto(current);
    }

    const target = { ...before, ...diff.after };
    if (diff.after.departmentId !== undefined) {
      await this.assertDepartmentExists(target.departmentId);
      const employeeCount = await this.countAllEmployees(id);
      if (employeeCount > 0) {
        throw new ConflictException({
          message: `Jabatan masih dipakai oleh ${employeeCount} karyawan (termasuk nonaktif), tidak bisa dipindah ke departemen lain.`,
          details: { employeeCount },
        });
      }
    }
    await this.assertNameAvailable(target.departmentId, target.name, id);

    const row = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.position.update({
        where: { id },
        data: diff.after,
        select: POSITION_SELECT,
      });
      await this.audit.recordChange(
        { entity: ENTITY, entityId: id, ...diff },
        tx,
      );
      return updated;
    });
    return toDto(row);
  }

  /** Hapus jabatan yang tidak dipakai karyawan mana pun (termasuk nonaktif). */
  async remove(id: string): Promise<void> {
    const position = await this.findRow(id);
    const employeeCount = await this.countAllEmployees(id);
    if (employeeCount > 0) {
      throw new ConflictException({
        message: `Jabatan masih dipakai oleh ${employeeCount} karyawan (termasuk nonaktif). Pindahkan dulu.`,
        details: { employeeCount },
      });
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.position.delete({ where: { id } });
      await this.audit.recordChange(
        {
          entity: ENTITY,
          entityId: id,
          before: { name: position.name, departmentId: position.departmentId },
        },
        tx,
      );
    });
  }

  private async findRow(id: string): Promise<PositionRow> {
    const row = await this.prisma.client.position.findUnique({
      where: { id },
      select: POSITION_SELECT,
    });
    if (!row) {
      throw new NotFoundException(OrganizationMessages.positionNotFound);
    }
    return row;
  }

  /** Semua karyawan yang merujuk jabatan ini, aktif maupun nonaktif. */
  private async countAllEmployees(positionId: string): Promise<number> {
    const position = await this.prisma.client.position.findUnique({
      where: { id: positionId },
      select: { _count: { select: { employees: true } } },
    });
    return position?._count.employees ?? 0;
  }

  private async assertDepartmentExists(departmentId: string): Promise<void> {
    const department = await this.prisma.client.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });
    if (!department) {
      throw new BadRequestException(OrganizationMessages.departmentNotFound);
    }
  }

  /** Nama unik di dalam departemen, tanpa membedakan huruf besar/kecil. */
  private async assertNameAvailable(
    departmentId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.client.position.findFirst({
      where: {
        departmentId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(OrganizationMessages.positionNameTaken);
    }
  }
}
