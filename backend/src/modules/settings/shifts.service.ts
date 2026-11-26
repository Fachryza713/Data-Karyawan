import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isValidShiftWindow } from '../../common/validation/formats.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ACTIVE_EMPLOYEE } from '../../prisma/soft-delete.extension.js';
import { diffSnapshots } from '../audit/audit-sanitize.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  CreateShiftDto,
  ShiftResponseDto,
  UpdateShiftDto,
} from './dto/shift.dto.js';
import { SettingsMessages } from './settings.constants.js';

const ENTITY = 'Shift';

const SHIFT_SELECT = {
  id: true,
  name: true,
  startTime: true,
  endTime: true,
  lateToleranceMin: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { employees: { where: ACTIVE_EMPLOYEE } } },
} as const satisfies Prisma.ShiftSelect;

type ShiftRow = Prisma.ShiftGetPayload<{ select: typeof SHIFT_SELECT }>;

type ShiftSnapshot = {
  name: string;
  startTime: string;
  endTime: string;
  lateToleranceMin: number;
};

function snapshot(row: ShiftSnapshot): ShiftSnapshot {
  return {
    name: row.name,
    startTime: row.startTime,
    endTime: row.endTime,
    lateToleranceMin: row.lateToleranceMin,
  };
}

function toDto(row: ShiftRow): ShiftResponseDto {
  return {
    ...snapshot(row),
    id: row.id,
    employeeCount: row._count.employees,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Jam pulang harus setelah jam masuk di hari yang sama. */
function assertValidWindow(startTime: string, endTime: string): void {
  if (!isValidShiftWindow(startTime, endTime)) {
    throw new BadRequestException(SettingsMessages.shiftWindowInvalid);
  }
}

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<ShiftResponseDto[]> {
    const rows = await this.prisma.client.shift.findMany({
      orderBy: [{ startTime: 'asc' }, { name: 'asc' }],
      select: SHIFT_SELECT,
    });
    return rows.map(toDto);
  }

  async findOne(id: string): Promise<ShiftResponseDto> {
    return toDto(await this.findRow(id));
  }

  async create(dto: CreateShiftDto): Promise<ShiftResponseDto> {
    assertValidWindow(dto.startTime, dto.endTime);
    await this.assertNameAvailable(dto.name);

    const row = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.shift.create({
        data: {
          name: dto.name,
          startTime: dto.startTime,
          endTime: dto.endTime,
          // Kosong = default kolom (15 menit).
          lateToleranceMin: dto.lateToleranceMin,
        },
        select: SHIFT_SELECT,
      });
      await this.audit.recordChange(
        { entity: ENTITY, entityId: created.id, after: snapshot(created) },
        tx,
      );
      return created;
    });
    return toDto(row);
  }

  /**
   * Ubah sebagian field. Jam masuk/pulang dicek setelah digabung dengan
   * nilai lama, jadi mengirim endTime saja tetap dibandingkan dengan
   * startTime yang tersimpan.
   */
  async update(id: string, dto: UpdateShiftDto): Promise<ShiftResponseDto> {
    const current = await this.findRow(id);
    const target: ShiftSnapshot = {
      name: dto.name ?? current.name,
      startTime: dto.startTime ?? current.startTime,
      endTime: dto.endTime ?? current.endTime,
      lateToleranceMin: dto.lateToleranceMin ?? current.lateToleranceMin,
    };
    const diff = diffSnapshots(snapshot(current), target);
    if (!diff) {
      return toDto(current);
    }
    assertValidWindow(target.startTime, target.endTime);
    if (diff.after.name !== undefined) {
      await this.assertNameAvailable(target.name, id);
    }

    const row = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.shift.update({
        where: { id },
        data: diff.after,
        select: SHIFT_SELECT,
      });
      await this.audit.recordChange(
        { entity: ENTITY, entityId: id, ...diff },
        tx,
      );
      return updated;
    });
    return toDto(row);
  }

  /** Hapus shift yang tidak dipakai karyawan mana pun (termasuk nonaktif). */
  async remove(id: string): Promise<void> {
    const shift = await this.prisma.client.shift.findUnique({
      where: { id },
      select: { ...SHIFT_SELECT, _count: { select: { employees: true } } },
    });
    if (!shift) {
      throw new NotFoundException(SettingsMessages.shiftNotFound);
    }

    const employeeCount = shift._count.employees;
    if (employeeCount > 0) {
      throw new ConflictException({
        message: `Shift masih dipakai oleh ${employeeCount} karyawan (termasuk nonaktif). Pindahkan dulu ke shift lain.`,
        details: { employeeCount },
      });
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.shift.delete({ where: { id } });
      await this.audit.recordChange(
        { entity: ENTITY, entityId: id, before: snapshot(shift) },
        tx,
      );
    });
  }

  private async findRow(id: string): Promise<ShiftRow> {
    const row = await this.prisma.client.shift.findUnique({
      where: { id },
      select: SHIFT_SELECT,
    });
    if (!row) {
      throw new NotFoundException(SettingsMessages.shiftNotFound);
    }
    return row;
  }

  /** Nama unik tanpa membedakan huruf besar/kecil. */
  private async assertNameAvailable(
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.client.shift.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(SettingsMessages.shiftNameTaken);
    }
  }
}
