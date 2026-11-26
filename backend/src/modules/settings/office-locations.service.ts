import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ACTIVE_EMPLOYEE } from '../../prisma/soft-delete.extension.js';
import { diffSnapshots } from '../audit/audit-sanitize.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  CreateOfficeLocationDto,
  OfficeLocationResponseDto,
  UpdateOfficeLocationDto,
} from './dto/office-location.dto.js';
import {
  COORDINATE_DECIMAL_PLACES,
  SettingsMessages,
} from './settings.constants.js';

const ENTITY = 'OfficeLocation';

const OFFICE_LOCATION_SELECT = {
  id: true,
  name: true,
  latitude: true,
  longitude: true,
  radiusM: true,
  createdAt: true,
  updatedAt: true,
  // Filter soft delete tidak berlaku di relasi bertingkat: tulis sendiri.
  _count: { select: { employees: { where: ACTIVE_EMPLOYEE } } },
} as const satisfies Prisma.OfficeLocationSelect;

type OfficeLocationRow = Prisma.OfficeLocationGetPayload<{
  select: typeof OFFICE_LOCATION_SELECT;
}>;

type OfficeLocationSnapshot = {
  name: string;
  latitude: Prisma.Decimal;
  longitude: Prisma.Decimal;
  radiusM: number;
};

/**
 * Koordinat disimpan di kolom Decimal(9, 6): dibulatkan ke 6 angka di
 * belakang koma (sekitar 0,1 meter) supaya nilai yang tersimpan sama dengan
 * yang dibandingkan untuk audit.
 */
export function toCoordinate(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(
    COORDINATE_DECIMAL_PLACES,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}

function snapshot(row: OfficeLocationSnapshot): OfficeLocationSnapshot {
  return {
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusM: row.radiusM,
  };
}

function toDto(row: OfficeLocationRow): OfficeLocationResponseDto {
  return {
    id: row.id,
    name: row.name,
    latitude: row.latitude.toNumber(),
    longitude: row.longitude.toNumber(),
    radiusM: row.radiusM,
    employeeCount: row._count.employees,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class OfficeLocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<OfficeLocationResponseDto[]> {
    const rows = await this.prisma.client.officeLocation.findMany({
      orderBy: { name: 'asc' },
      select: OFFICE_LOCATION_SELECT,
    });
    return rows.map(toDto);
  }

  async findOne(id: string): Promise<OfficeLocationResponseDto> {
    return toDto(await this.findRow(id));
  }

  async create(
    dto: CreateOfficeLocationDto,
  ): Promise<OfficeLocationResponseDto> {
    await this.assertNameAvailable(dto.name);
    const row = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.officeLocation.create({
        data: {
          name: dto.name,
          latitude: toCoordinate(dto.latitude),
          longitude: toCoordinate(dto.longitude),
          // Kosong = default kolom (100 meter).
          radiusM: dto.radiusM,
        },
        select: OFFICE_LOCATION_SELECT,
      });
      await this.audit.recordChange(
        { entity: ENTITY, entityId: created.id, after: snapshot(created) },
        tx,
      );
      return created;
    });
    return toDto(row);
  }

  async update(
    id: string,
    dto: UpdateOfficeLocationDto,
  ): Promise<OfficeLocationResponseDto> {
    const current = await this.findRow(id);
    const diff = diffSnapshots(snapshot(current), {
      name: dto.name ?? current.name,
      latitude:
        dto.latitude === undefined
          ? current.latitude
          : toCoordinate(dto.latitude),
      longitude:
        dto.longitude === undefined
          ? current.longitude
          : toCoordinate(dto.longitude),
      radiusM: dto.radiusM ?? current.radiusM,
    });
    if (!diff) {
      return toDto(current);
    }
    if (diff.after.name !== undefined) {
      await this.assertNameAvailable(diff.after.name, id);
    }

    const row = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.officeLocation.update({
        where: { id },
        data: diff.after,
        select: OFFICE_LOCATION_SELECT,
      });
      await this.audit.recordChange(
        { entity: ENTITY, entityId: id, ...diff },
        tx,
      );
      return updated;
    });
    return toDto(row);
  }

  /**
   * Hapus lokasi yang tidak dipakai karyawan mana pun. Karyawan nonaktif
   * ikut dihitung karena datanya tetap merujuk lokasi ini (foreign key).
   */
  async remove(id: string): Promise<void> {
    const location = await this.prisma.client.officeLocation.findUnique({
      where: { id },
      select: {
        ...OFFICE_LOCATION_SELECT,
        _count: { select: { employees: true } },
      },
    });
    if (!location) {
      throw new NotFoundException(SettingsMessages.officeLocationNotFound);
    }

    const employeeCount = location._count.employees;
    if (employeeCount > 0) {
      throw new ConflictException({
        message: `Lokasi kantor masih dipakai oleh ${employeeCount} karyawan (termasuk nonaktif). Pindahkan dulu ke lokasi lain.`,
        details: { employeeCount },
      });
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.officeLocation.delete({ where: { id } });
      await this.audit.recordChange(
        { entity: ENTITY, entityId: id, before: snapshot(location) },
        tx,
      );
    });
  }

  private async findRow(id: string): Promise<OfficeLocationRow> {
    const row = await this.prisma.client.officeLocation.findUnique({
      where: { id },
      select: OFFICE_LOCATION_SELECT,
    });
    if (!row) {
      throw new NotFoundException(SettingsMessages.officeLocationNotFound);
    }
    return row;
  }

  /** Nama unik tanpa membedakan huruf besar/kecil. */
  private async assertNameAvailable(
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.client.officeLocation.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(SettingsMessages.officeLocationNameTaken);
    }
  }
}
