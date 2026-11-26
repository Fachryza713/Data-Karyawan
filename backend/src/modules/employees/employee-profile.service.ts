import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { parseDateOnly } from '../../common/validation/date-only.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { diffSnapshots } from '../audit/audit-sanitize.js';
import { AuditService } from '../audit/audit.service.js';
import { StorageService } from '../storage/storage.service.js';
import {
  assertUploadAllowed,
  AVATAR_UPLOAD_POLICY,
  detectImageType,
  IMAGE_SIGNATURE_LENGTH,
} from '../storage/upload-policy.js';
import type {
  PhotoUploadUrlDto,
  UpdateMyProfileDto,
} from './dto/employee-request.dto.js';
import type {
  EmployeeResponseDto,
  PhotoUploadUrlResponseDto,
} from './dto/employee-response.dto.js';
import {
  definedOnly,
  EMPLOYEE_SELECT,
  type EmployeeRow,
  employeeSnapshot,
} from './employee.select.js';
import { EmployeeSerializer } from './employee.serializer.js';
import {
  EmployeeMessages,
  isAvatarKeyOf,
  newAvatarKey,
} from './employees.constants.js';

const ENTITY = 'Employee';

/**
 * Data diri karyawan yang sedang login (/employees/me). Karyawan selalu
 * dicari dari user ID di JWT, tidak pernah dari parameter request.
 */
@Injectable()
export class EmployeeProfileService {
  private readonly logger = new Logger(EmployeeProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly serializer: EmployeeSerializer,
    private readonly storage: StorageService,
  ) {}

  async getMine(userId: string): Promise<EmployeeResponseDto> {
    return this.serializer.toDto(await this.findMine(userId));
  }

  /** Ubah data diri: hanya fullName, phone, gender, birthDate. */
  async updateMine(
    userId: string,
    dto: UpdateMyProfileDto,
  ): Promise<EmployeeResponseDto> {
    const current = await this.findMine(userId);
    const before = employeeSnapshot(current);
    // Daftar field ditulis eksplisit: field lain dari body tidak pernah dibaca.
    const requested = definedOnly({
      fullName: dto.fullName,
      phone: dto.phone,
      gender: dto.gender,
      birthDate: dto.birthDate,
    });
    const diff = diffSnapshots(before, { ...before, ...requested });
    if (!diff) {
      return this.serializer.toDto(current);
    }

    const { fullName, phone, gender, birthDate } = diff.after;
    const row = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id: current.id },
        data: {
          fullName,
          phone,
          gender,
          ...(birthDate !== undefined && {
            birthDate: birthDate === null ? null : parseDateOnly(birthDate),
          }),
        },
        select: EMPLOYEE_SELECT,
      });
      await this.audit.recordChange(
        { entity: ENTITY, entityId: current.id, ...diff },
        tx,
      );
      return updated;
    });
    return this.serializer.toDto(row);
  }

  /**
   * Presigned POST untuk foto profil baru. Tipe dan ukuran dicek dulu
   * (JPG/PNG, maks 2 MB); policy upload mengunci batas yang sama di storage.
   */
  async createPhotoUpload(
    userId: string,
    dto: PhotoUploadUrlDto,
  ): Promise<PhotoUploadUrlResponseDto> {
    const employee = await this.findMine(userId);
    assertUploadAllowed(AVATAR_UPLOAD_POLICY, dto);

    const upload = await this.storage.createPresignedUpload(
      newAvatarKey(employee.id),
      dto.contentType,
      AVATAR_UPLOAD_POLICY.maxBytes,
    );
    return {
      key: upload.key,
      method: 'POST',
      url: upload.url,
      fields: upload.fields,
      maxBytes: upload.maxBytes,
      expiresAt: upload.expiresAt.toISOString(),
    };
  }

  /**
   * Pakai foto yang sudah diunggah. Key harus milik karyawan ini, file harus
   * ada dan benar-benar JPG/PNG (dicek dari isi file) maksimal 2 MB. Foto
   * lama dihapus dari storage setelah perubahan tersimpan.
   */
  async confirmPhoto(
    userId: string,
    key: string,
  ): Promise<EmployeeResponseDto> {
    const current = await this.findMine(userId);
    if (!isAvatarKeyOf(current.id, key)) {
      throw new BadRequestException(EmployeeMessages.invalidPhotoKey);
    }
    if (current.photoKey === key) {
      return this.serializer.toDto(current);
    }
    await this.assertUploadedImage(key);

    const row = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id: current.id },
        data: { photoKey: key },
        select: EMPLOYEE_SELECT,
      });
      await this.audit.recordChange(
        {
          entity: ENTITY,
          entityId: current.id,
          before: { photoKey: current.photoKey },
          after: { photoKey: key },
        },
        tx,
      );
      return updated;
    });

    if (current.photoKey) {
      await this.deleteQuietly(current.photoKey);
    }
    return this.serializer.toDto(row);
  }

  private async findMine(userId: string): Promise<EmployeeRow> {
    const row = await this.prisma.client.employee.findUnique({
      where: { userId },
      select: EMPLOYEE_SELECT,
    });
    if (!row) {
      throw new NotFoundException(EmployeeMessages.noEmployeeRecord);
    }
    return row;
  }

  private async assertUploadedImage(key: string): Promise<void> {
    const object = await this.storage.stat(key);
    if (!object) {
      throw new BadRequestException(EmployeeMessages.photoNotUploaded);
    }
    const detected =
      object.size <= AVATAR_UPLOAD_POLICY.maxBytes
        ? detectImageType(
            await this.storage.readStart(key, IMAGE_SIGNATURE_LENGTH),
          )
        : null;
    if (
      !detected ||
      !AVATAR_UPLOAD_POLICY.allowedContentTypes.includes(detected)
    ) {
      // File tidak lolos tidak boleh tertinggal di storage.
      await this.deleteQuietly(key);
      throw new BadRequestException(EmployeeMessages.invalidPhotoFile);
    }
  }

  /** Hapus file tanpa menggagalkan request; kegagalan hanya dicatat. */
  private async deleteQuietly(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.warn({ err: error, key }, 'Gagal menghapus file foto');
    }
  }
}
