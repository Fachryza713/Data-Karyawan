import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { type QueryArgs, queryMock } from '../../../test/fixtures/employees.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import { CompanySettingsService } from './company-settings.service.js';
import {
  OfficeLocationsService,
  toCoordinate,
} from './office-locations.service.js';
import { SettingsMessages } from './settings.constants.js';
import { ShiftsService } from './shifts.service.js';

const OFFICE = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e03';
const SHIFT = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e04';
const OTHER = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e30';
const at = new Date('2026-11-25T01:00:00.000Z');
const later = new Date('2026-11-26T02:00:00.000Z');

function setup() {
  const model = () => ({
    findMany: queryMock().mockResolvedValue([]),
    findUnique: queryMock().mockResolvedValue(null),
    findFirst: queryMock().mockResolvedValue(null),
    create: queryMock(),
    update: queryMock(),
    upsert: queryMock(),
    delete: queryMock().mockResolvedValue({}),
  });
  const client = {
    officeLocation: model(),
    shift: model(),
    companySetting: model(),
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn(client),
    ),
  };
  const audit = {
    recordChange: jest
      .fn<AuditService['recordChange']>()
      .mockResolvedValue(undefined),
  };
  const prisma = { client } as unknown as PrismaService;
  const auditService = audit as unknown as AuditService;
  return {
    client,
    audit,
    locations: new OfficeLocationsService(prisma, auditService),
    shifts: new ShiftsService(prisma, auditService),
    settings: new CompanySettingsService(prisma, auditService),
  };
}

const firstArgs = (mock: { mock: { calls: QueryArgs[][] } }) =>
  mock.mock.calls[0][0];

const officeRow = (overrides: Record<string, unknown> = {}) => ({
  id: OFFICE,
  name: 'Head Office Jakarta',
  latitude: new Prisma.Decimal('-6.224889'),
  longitude: new Prisma.Decimal('106.809889'),
  radiusM: 100,
  createdAt: at,
  updatedAt: at,
  _count: { employees: 0 },
  ...overrides,
});

const shiftRow = (overrides: Record<string, unknown> = {}) => ({
  id: SHIFT,
  name: 'Reguler',
  startTime: '08:30',
  endTime: '17:30',
  lateToleranceMin: 15,
  createdAt: at,
  updatedAt: at,
  _count: { employees: 0 },
  ...overrides,
});

// ---------------------------------------------------------------------------
// Lokasi kantor
// ---------------------------------------------------------------------------

describe('toCoordinate', () => {
  it.each([
    [-6.2248891234, '-6.224889'],
    [106.8098895, '106.80989'],
    [-6.2248885, '-6.224889'],
    [90, '90'],
  ])('%p dibulatkan ke 6 desimal: %s', (input, expected) => {
    expect(toCoordinate(input).toString()).toBe(expected);
  });
});

describe('OfficeLocationsService', () => {
  it('tambah lokasi: koordinat disimpan Decimal 6 desimal, radius kosong pakai default kolom, dicatat audit', async () => {
    const { locations, client, audit } = setup();
    client.officeLocation.create.mockResolvedValue(officeRow());

    const result = await locations.create({
      name: 'Head Office Jakarta',
      latitude: -6.2248891234,
      longitude: 106.809889,
    });

    const data = firstArgs(client.officeLocation.create).data as {
      latitude: Prisma.Decimal;
      longitude: Prisma.Decimal;
      radiusM?: number;
    };
    expect(Prisma.Decimal.isDecimal(data.latitude)).toBe(true);
    expect(data.latitude.toString()).toBe('-6.224889');
    expect(data.longitude.toString()).toBe('106.809889');
    expect(data.radiusM).toBeUndefined();
    expect(result).toMatchObject({
      latitude: -6.224889,
      longitude: 106.809889,
      radiusM: 100,
      employeeCount: 0,
    });
    expect(audit.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'OfficeLocation', entityId: OFFICE }),
      client,
    );
  });

  it('nama lokasi unik tanpa membedakan huruf besar/kecil: 409', async () => {
    const { locations, client } = setup();
    client.officeLocation.findFirst.mockResolvedValue({ id: OTHER });

    await expect(
      locations.create({
        name: 'head office jakarta',
        latitude: 0,
        longitude: 0,
      }),
    ).rejects.toThrow(
      new ConflictException(SettingsMessages.officeLocationNameTaken),
    );
    expect(client.officeLocation.create).not.toHaveBeenCalled();
  });

  it('ubah radius: hanya field yang berubah yang ditulis dan dicatat audit', async () => {
    const { locations, client, audit } = setup();
    client.officeLocation.findUnique.mockResolvedValue(officeRow());
    client.officeLocation.update.mockResolvedValue(
      officeRow({ radiusM: 150, updatedAt: later }),
    );

    await locations.update(OFFICE, {
      radiusM: 150,
      // Sama dengan nilai tersimpan setelah dibulatkan: bukan perubahan.
      latitude: -6.2248891,
    });

    expect(firstArgs(client.officeLocation.update).data).toEqual({
      radiusM: 150,
    });
    expect(audit.recordChange).toHaveBeenCalledWith(
      {
        entity: 'OfficeLocation',
        entityId: OFFICE,
        before: { radiusM: 100 },
        after: { radiusM: 150 },
      },
      client,
    );
    // Nama tidak berubah: tidak perlu cek nama.
    expect(client.officeLocation.findFirst).not.toHaveBeenCalled();
  });

  it('ubah tanpa perubahan: tidak menulis dan tidak mencatat audit', async () => {
    const { locations, client, audit } = setup();
    client.officeLocation.findUnique.mockResolvedValue(officeRow());

    await locations.update(OFFICE, { radiusM: 100 });

    expect(client.officeLocation.update).not.toHaveBeenCalled();
    expect(audit.recordChange).not.toHaveBeenCalled();
  });

  it('hapus lokasi yang masih dipakai: 409 dengan jumlah karyawan (termasuk nonaktif)', async () => {
    const { locations, client } = setup();
    client.officeLocation.findUnique.mockResolvedValue(
      officeRow({ _count: { employees: 27 } }),
    );

    const error = await locations.remove(OFFICE).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      message:
        'Lokasi kantor masih dipakai oleh 27 karyawan (termasuk nonaktif). Pindahkan dulu ke lokasi lain.',
      details: { employeeCount: 27 },
    });
    // Hitungan pemakai tanpa filter soft delete.
    expect(firstArgs(client.officeLocation.findUnique).select).toMatchObject({
      _count: { select: { employees: true } },
    });
    expect(client.officeLocation.delete).not.toHaveBeenCalled();
  });

  it('hapus lokasi yang tidak dipakai: terhapus dan dicatat audit', async () => {
    const { locations, client, audit } = setup();
    client.officeLocation.findUnique.mockResolvedValue(officeRow());

    await locations.remove(OFFICE);

    expect(firstArgs(client.officeLocation.delete).where).toEqual({
      id: OFFICE,
    });
    expect(audit.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'OfficeLocation',
        entityId: OFFICE,
        before: expect.objectContaining({ name: 'Head Office Jakarta' }),
      }),
      client,
    );
  });

  it('lokasi tidak ada: 404', async () => {
    const { locations } = setup();

    await expect(locations.findOne(OFFICE)).rejects.toThrow(
      new NotFoundException(SettingsMessages.officeLocationNotFound),
    );
  });
});

// ---------------------------------------------------------------------------
// Shift
// ---------------------------------------------------------------------------

describe('ShiftsService', () => {
  it.each([
    ['17:30', '08:30'],
    ['08:30', '08:30'],
    ['22:00', '06:00'],
  ])(
    'tambah shift %s-%s ditolak: jam pulang harus setelah jam masuk',
    async (startTime, endTime) => {
      const { shifts, client } = setup();

      await expect(
        shifts.create({ name: 'Malam', startTime, endTime }),
      ).rejects.toThrow(
        new BadRequestException(SettingsMessages.shiftWindowInvalid),
      );
      expect(client.shift.create).not.toHaveBeenCalled();
    },
  );

  it('tambah shift valid: toleransi kosong pakai default kolom, dicatat audit', async () => {
    const { shifts, client, audit } = setup();
    client.shift.create.mockResolvedValue(
      shiftRow({ name: 'Pagi', startTime: '07:00', endTime: '15:00' }),
    );

    await shifts.create({ name: 'Pagi', startTime: '07:00', endTime: '15:00' });

    expect(firstArgs(client.shift.create).data).toEqual({
      name: 'Pagi',
      startTime: '07:00',
      endTime: '15:00',
      lateToleranceMin: undefined,
    });
    expect(audit.recordChange).toHaveBeenCalledWith(
      {
        entity: 'Shift',
        entityId: SHIFT,
        after: {
          name: 'Pagi',
          startTime: '07:00',
          endTime: '15:00',
          lateToleranceMin: 15,
        },
      },
      client,
    );
  });

  it('PATCH endTime saja dibandingkan dengan startTime tersimpan: 400', async () => {
    const { shifts, client } = setup();
    client.shift.findUnique.mockResolvedValue(shiftRow());

    await expect(shifts.update(SHIFT, { endTime: '08:00' })).rejects.toThrow(
      new BadRequestException(SettingsMessages.shiftWindowInvalid),
    );
    expect(client.shift.update).not.toHaveBeenCalled();
  });

  it('PATCH startTime dan endTime bersamaan: dicek terhadap nilai baru', async () => {
    const { shifts, client, audit } = setup();
    client.shift.findUnique.mockResolvedValue(shiftRow());
    client.shift.update.mockResolvedValue(
      shiftRow({ startTime: '18:00', endTime: '23:00' }),
    );

    await shifts.update(SHIFT, { startTime: '18:00', endTime: '23:00' });

    expect(firstArgs(client.shift.update).data).toEqual({
      startTime: '18:00',
      endTime: '23:00',
    });
    expect(audit.recordChange).toHaveBeenCalledWith(
      {
        entity: 'Shift',
        entityId: SHIFT,
        before: { startTime: '08:30', endTime: '17:30' },
        after: { startTime: '18:00', endTime: '23:00' },
      },
      client,
    );
  });

  it('nama shift unik tanpa membedakan huruf besar/kecil: 409', async () => {
    const { shifts, client } = setup();
    client.shift.findUnique.mockResolvedValue(shiftRow());
    client.shift.findFirst.mockResolvedValue({ id: OTHER });

    await expect(shifts.update(SHIFT, { name: 'pagi' })).rejects.toThrow(
      new ConflictException(SettingsMessages.shiftNameTaken),
    );
    expect(firstArgs(client.shift.findFirst).where).toEqual({
      name: { equals: 'pagi', mode: 'insensitive' },
      id: { not: SHIFT },
    });
  });

  it('hapus shift yang masih dipakai: 409 dengan jumlah karyawan', async () => {
    const { shifts, client } = setup();
    client.shift.findUnique.mockResolvedValue(
      shiftRow({ _count: { employees: 3 } }),
    );

    const error = await shifts.remove(SHIFT).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      message:
        'Shift masih dipakai oleh 3 karyawan (termasuk nonaktif). Pindahkan dulu ke shift lain.',
      details: { employeeCount: 3 },
    });
    expect(client.shift.delete).not.toHaveBeenCalled();
  });

  it('hapus shift yang tidak dipakai: terhapus dan dicatat audit', async () => {
    const { shifts, client, audit } = setup();
    client.shift.findUnique.mockResolvedValue(shiftRow());

    await shifts.remove(SHIFT);

    expect(firstArgs(client.shift.delete).where).toEqual({ id: SHIFT });
    expect(audit.recordChange).toHaveBeenCalledWith(
      {
        entity: 'Shift',
        entityId: SHIFT,
        before: {
          name: 'Reguler',
          startTime: '08:30',
          endTime: '17:30',
          lateToleranceMin: 15,
        },
      },
      client,
    );
  });
});

// ---------------------------------------------------------------------------
// Kontak (company_settings)
// ---------------------------------------------------------------------------

describe('CompanySettingsService', () => {
  const hrContact = {
    email: 'hr@bluerose.test',
    whatsapp: '6281200000000',
    hours: 'Senin-Jumat 08:30-17:30 WIB',
  };

  it('baca kontak HR', async () => {
    const { settings, client } = setup();
    client.companySetting.findUnique.mockResolvedValue({
      value: hrContact,
      updatedAt: at,
    });

    await expect(settings.getContact('hr_contact')).resolves.toEqual({
      ...hrContact,
      updatedAt: at.toISOString(),
    });
    expect(firstArgs(client.companySetting.findUnique).where).toEqual({
      key: 'hr_contact',
    });
  });

  it('kontak yang belum diatur: 404', async () => {
    const { settings } = setup();

    await expect(settings.getContact('admin_contact')).rejects.toThrow(
      new NotFoundException('Kontak admin sistem belum diatur'),
    );
  });

  it('value rusak (diubah manual) dianggap belum diatur: 404', async () => {
    const { settings, client } = setup();
    client.companySetting.findUnique.mockResolvedValue({
      value: { email: 'hr@bluerose.test' },
      updatedAt: at,
    });

    await expect(settings.getContact('hr_contact')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('ubah nomor WhatsApp: hanya field yang berubah dicatat audit dengan key sebagai entityId', async () => {
    const { settings, client, audit } = setup();
    client.companySetting.findUnique.mockResolvedValue({
      value: hrContact,
      updatedAt: at,
    });
    client.companySetting.upsert.mockResolvedValue({
      value: { ...hrContact, whatsapp: '6281299998888' },
      updatedAt: later,
    });

    const result = await settings.updateContact('hr_contact', {
      ...hrContact,
      whatsapp: '6281299998888',
    });

    expect(result).toEqual({
      ...hrContact,
      whatsapp: '6281299998888',
      updatedAt: later.toISOString(),
    });
    expect(firstArgs(client.companySetting.upsert)).toMatchObject({
      where: { key: 'hr_contact' },
      update: { value: { ...hrContact, whatsapp: '6281299998888' } },
    });
    expect(audit.recordChange).toHaveBeenCalledWith(
      {
        entity: 'CompanySetting',
        entityId: 'hr_contact',
        before: { whatsapp: '6281200000000' },
        after: { whatsapp: '6281299998888' },
      },
      client,
    );
  });

  it('nilai sama persis: tidak menulis dan tidak mencatat audit', async () => {
    const { settings, client, audit } = setup();
    client.companySetting.findUnique.mockResolvedValue({
      value: hrContact,
      updatedAt: at,
    });

    await settings.updateContact('hr_contact', { ...hrContact });

    expect(client.companySetting.upsert).not.toHaveBeenCalled();
    expect(audit.recordChange).not.toHaveBeenCalled();
  });

  it('kontak admin belum ada: dibuat dan dicatat audit tanpa before', async () => {
    const { settings, client, audit } = setup();
    const adminContact = {
      email: 'it@bluerose.test',
      whatsapp: '6281200000001',
      hours: 'Senin-Jumat 09:00-17:00 WIB',
    };
    client.companySetting.upsert.mockResolvedValue({
      value: adminContact,
      updatedAt: later,
    });

    await settings.updateContact('admin_contact', adminContact);

    expect(firstArgs(client.companySetting.upsert)).toMatchObject({
      where: { key: 'admin_contact' },
      create: { key: 'admin_contact', value: adminContact },
    });
    expect(audit.recordChange).toHaveBeenCalledWith(
      {
        entity: 'CompanySetting',
        entityId: 'admin_contact',
        before: undefined,
        after: adminContact,
      },
      client,
    );
  });
});
