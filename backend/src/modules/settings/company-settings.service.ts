import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { diffSnapshots } from '../audit/audit-sanitize.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  ContactResponseDto,
  UpdateContactDto,
} from './dto/contact.dto.js';
import {
  CONTACT_LABELS,
  type ContactSettingKey,
} from './settings.constants.js';

const ENTITY = 'CompanySetting';

/** Bentuk value CompanySetting hr_contact dan admin_contact. */
type Contact = { email: string; whatsapp: string; hours: string };

const SETTING_SELECT = {
  value: true,
  updatedAt: true,
} as const satisfies Prisma.CompanySettingSelect;

/** Null jika value bukan kontak lengkap (misalnya diubah manual di database). */
export function parseContact(value: Prisma.JsonValue): Contact | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const { email, whatsapp, hours } = value;
  if (
    typeof email !== 'string' ||
    typeof whatsapp !== 'string' ||
    typeof hours !== 'string'
  ) {
    return null;
  }
  return { email, whatsapp, hours };
}

function toDto(contact: Contact, updatedAt: Date): ContactResponseDto {
  return { ...contact, updatedAt: updatedAt.toISOString() };
}

/** Pengaturan perusahaan (tabel key/value company_settings). */
@Injectable()
export class CompanySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getContact(key: ContactSettingKey): Promise<ContactResponseDto> {
    const row = await this.prisma.client.companySetting.findUnique({
      where: { key },
      select: SETTING_SELECT,
    });
    const contact = row && parseContact(row.value);
    if (!row || !contact) {
      throw new NotFoundException(`${CONTACT_LABELS[key]} belum diatur`);
    }
    return toDto(contact, row.updatedAt);
  }

  /**
   * Ganti seluruh kontak (dibuat jika belum ada). Nilai yang sama persis
   * tidak ditulis ulang dan tidak dicatat di audit.
   */
  async updateContact(
    key: ContactSettingKey,
    dto: UpdateContactDto,
  ): Promise<ContactResponseDto> {
    const current = await this.prisma.client.companySetting.findUnique({
      where: { key },
      select: SETTING_SELECT,
    });
    const before = current && parseContact(current.value);
    const after: Contact = {
      email: dto.email,
      whatsapp: dto.whatsapp,
      hours: dto.hours,
    };

    const diff = before ? diffSnapshots(before, after) : null;
    if (current && before && !diff) {
      return toDto(before, current.updatedAt);
    }

    const row = await this.prisma.client.$transaction(async (tx) => {
      const saved = await tx.companySetting.upsert({
        where: { key },
        create: { key, value: after },
        update: { value: after },
        select: SETTING_SELECT,
      });
      await this.audit.recordChange(
        {
          entity: ENTITY,
          entityId: key,
          // Value lama yang rusak dicatat apa adanya supaya jejaknya tidak hilang.
          ...(diff ?? { before: current?.value ?? undefined, after }),
        },
        tx,
      );
      return saved;
    });
    return toDto(after, row.updatedAt);
  }
}
