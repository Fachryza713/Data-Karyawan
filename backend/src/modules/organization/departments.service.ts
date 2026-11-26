import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ACTIVE_EMPLOYEE } from '../../prisma/soft-delete.extension.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  CreateDepartmentDto,
  DepartmentResponseDto,
  UpdateDepartmentDto,
} from './dto/organization.dto.js';
import { OrganizationMessages } from './organization.constants.js';

const ENTITY = 'Department';

const DEPARTMENT_SELECT = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      // Filter soft delete tidak berlaku di relasi bertingkat: tulis sendiri.
      employees: { where: ACTIVE_EMPLOYEE },
      positions: true,
    },
  },
} as const satisfies Prisma.DepartmentSelect;

type DepartmentRow = Prisma.DepartmentGetPayload<{
  select: typeof DEPARTMENT_SELECT;
}>;

function toDto(row: DepartmentRow): DepartmentResponseDto {
  return {
    id: row.id,
    name: row.name,
    employeeCount: row._count.employees,
    positionCount: row._count.positions,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<DepartmentResponseDto[]> {
    const rows = await this.prisma.client.department.findMany({
      orderBy: { name: 'asc' },
      select: DEPARTMENT_SELECT,
    });
    return rows.map(toDto);
  }

  async findOne(id: string): Promise<DepartmentResponseDto> {
    return toDto(await this.findRow(id));
  }

  async create(dto: CreateDepartmentDto): Promise<DepartmentResponseDto> {
    await this.assertNameAvailable(dto.name);
    const row = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.department.create({
        data: { name: dto.name },
        select: DEPARTMENT_SELECT,
      });
      await this.audit.recordChange(
        { entity: ENTITY, entityId: created.id, after: { name: created.name } },
        tx,
      );
      return created;
    });
    return toDto(row);
  }

  async update(
    id: string,
    dto: UpdateDepartmentDto,
  ): Promise<DepartmentResponseDto> {
    const current = await this.findRow(id);
    if (dto.name === undefined || dto.name === current.name) {
      return toDto(current);
    }
    await this.assertNameAvailable(dto.name, id);

    const row = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.department.update({
        where: { id },
        data: { name: dto.name },
        select: DEPARTMENT_SELECT,
      });
      await this.audit.recordChange(
        {
          entity: ENTITY,
          entityId: id,
          before: { name: current.name },
          after: { name: updated.name },
        },
        tx,
      );
      return updated;
    });
    return toDto(row);
  }

  /**
   * Hapus departemen yang tidak dipakai. Ditolak 409 (beserta jumlahnya)
   * jika masih ada karyawan, termasuk karyawan nonaktif yang riwayatnya
   * tetap merujuk departemen ini, atau masih punya jabatan.
   */
  async remove(id: string): Promise<void> {
    const department = await this.prisma.client.department.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        _count: { select: { employees: true, positions: true } },
      },
    });
    if (!department) {
      throw new NotFoundException(OrganizationMessages.departmentNotFound);
    }

    const { employees: employeeCount, positions: positionCount } =
      department._count;
    if (employeeCount > 0 || positionCount > 0) {
      const usage = [
        employeeCount > 0 && `${employeeCount} karyawan (termasuk nonaktif)`,
        positionCount > 0 && `${positionCount} jabatan`,
      ].filter(Boolean);
      throw new ConflictException({
        message: `Departemen masih dipakai oleh ${usage.join(' dan ')}. Pindahkan atau hapus dulu.`,
        details: { employeeCount, positionCount },
      });
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.department.delete({ where: { id } });
      await this.audit.recordChange(
        { entity: ENTITY, entityId: id, before: { name: department.name } },
        tx,
      );
    });
  }

  private async findRow(id: string): Promise<DepartmentRow> {
    const row = await this.prisma.client.department.findUnique({
      where: { id },
      select: DEPARTMENT_SELECT,
    });
    if (!row) {
      throw new NotFoundException(OrganizationMessages.departmentNotFound);
    }
    return row;
  }

  /** Nama unik tanpa membedakan huruf besar/kecil ("IT" dan "it" bentrok). */
  private async assertNameAvailable(
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.client.department.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(OrganizationMessages.departmentNameTaken);
    }
  }
}
