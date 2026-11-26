import { Injectable } from '@nestjs/common';
import { toDateOnly } from '../../common/validation/date-only.js';
import { StorageService } from '../storage/storage.service.js';
import type { EmployeeResponseDto } from './dto/employee-response.dto.js';
import type { EmployeeRow } from './employee.select.js';

/** Ubah baris Prisma menjadi EmployeeResponseDto, termasuk presigned photoUrl. */
@Injectable()
export class EmployeeSerializer {
  constructor(private readonly storage: StorageService) {}

  async toDto(row: EmployeeRow): Promise<EmployeeResponseDto> {
    return {
      id: row.id,
      userId: row.userId,
      nip: row.nip,
      fullName: row.fullName,
      email: row.user.email,
      role: row.user.role,
      phone: row.phone,
      gender: row.gender,
      birthDate: row.birthDate ? toDateOnly(row.birthDate) : null,
      joinDate: toDateOnly(row.joinDate),
      employmentStatus: row.employmentStatus,
      photoUrl: row.photoKey
        ? await this.storage.createPresignedDownload(row.photoKey)
        : null,
      isActive: row.deletedAt === null && row.user.isActive,
      department: row.department,
      position: row.position,
      officeLocation: row.officeLocation,
      shift: row.shift,
      deletedAt: row.deletedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  toDtos(rows: EmployeeRow[]): Promise<EmployeeResponseDto[]> {
    return Promise.all(rows.map((row) => this.toDto(row)));
  }
}
