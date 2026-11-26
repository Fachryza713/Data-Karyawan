import { jest } from '@jest/globals';
import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import {
  employeeRow,
  IDS,
  type QueryArgs,
  queryMock,
  serializerWith,
  storageMock,
} from '../../../test/fixtures/employees.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { StorageService } from '../storage/storage.service.js';
import type { UpdateMyProfileDto } from './dto/employee-request.dto.js';
import { EmployeeProfileService } from './employee-profile.service.js';
import { EmployeeMessages } from './employees.constants.js';

const MB = 1024 * 1024;
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ownKey = `employees/${IDS.employee}/avatar-1b4e28ba-2fa1-4d2e-8f3a-0123456789ab`;
const oldKey = `employees/${IDS.employee}/avatar-00000000-0000-4000-8000-000000000000`;

function setup(row = employeeRow()) {
  const employee = {
    findUnique: queryMock().mockResolvedValue(row),
    update: queryMock().mockImplementation((args) =>
      Promise.resolve({ ...row, ...args.data }),
    ),
  };
  const user = { update: queryMock() };
  const client = {
    employee,
    user,
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn(client),
    ),
  };
  const audit = {
    recordChange: jest
      .fn<AuditService['recordChange']>()
      .mockResolvedValue(undefined),
  };
  const storage = storageMock();
  const service = new EmployeeProfileService(
    { client } as unknown as PrismaService,
    audit as unknown as AuditService,
    serializerWith(storage),
    storage as unknown as StorageService,
  );
  return { service, client, employee, user, audit, storage };
}

const firstArgs = (mock: { mock: { calls: QueryArgs[][] } }) =>
  mock.mock.calls[0][0];

describe('EmployeeProfileService: data diri', () => {
  it('GET /me mencari karyawan dari user ID (JWT)', async () => {
    const { service, employee } = setup();

    await expect(service.getMine(IDS.user)).resolves.toMatchObject({
      id: IDS.employee,
    });
    expect(firstArgs(employee.findUnique).where).toEqual({ userId: IDS.user });
  });

  it('akun tanpa data karyawan (atau sudah nonaktif): 404', async () => {
    const { service, employee } = setup();
    employee.findUnique.mockResolvedValue(null);

    await expect(service.getMine(IDS.user)).rejects.toThrow(
      new NotFoundException(EmployeeMessages.noEmployeeRecord),
    );
  });

  it('PATCH /me hanya menulis fullName, phone, gender, birthDate; department dan role tidak pernah ikut', async () => {
    const { service, employee, user, audit } = setup();
    // Seandainya ValidationPipe terlewat, field ekstra tetap diabaikan.
    const dto = {
      fullName: 'Raditya P.',
      phone: null,
      gender: 'MALE',
      birthDate: '1999-01-02',
      departmentId: IDS.otherDepartment,
      role: 'HR',
      nip: 'BRT-2026-9999',
    } as unknown as UpdateMyProfileDto;

    await service.updateMine(IDS.user, dto);

    const { where, data } = firstArgs(employee.update);
    expect(where).toEqual({ id: IDS.employee });
    expect(data).toEqual({
      fullName: 'Raditya P.',
      phone: null,
      gender: undefined,
      birthDate: new Date('1999-01-02T00:00:00.000Z'),
    });
    expect(user.update).not.toHaveBeenCalled();
    expect(audit.recordChange.mock.calls[0][0]).toEqual({
      entity: 'Employee',
      entityId: IDS.employee,
      before: {
        fullName: 'Raditya Pratama',
        phone: '0812-3456-7890',
        birthDate: '1998-04-12',
      },
      after: { fullName: 'Raditya P.', phone: null, birthDate: '1999-01-02' },
    });
  });

  it('PATCH /me tanpa perubahan tidak menulis apa pun', async () => {
    const { service, employee, audit } = setup();

    await service.updateMine(IDS.user, { fullName: 'Raditya Pratama' });

    expect(employee.update).not.toHaveBeenCalled();
    expect(audit.recordChange).not.toHaveBeenCalled();
  });
});

describe('EmployeeProfileService: foto profil', () => {
  it('upload-url menolak tipe selain JPG/PNG sebelum URL dibuat', async () => {
    const { service, storage } = setup();

    await expect(
      service.createPhotoUpload(IDS.user, {
        contentType: 'image/gif',
        size: 1000,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(storage.createPresignedUpload).not.toHaveBeenCalled();
  });

  it('upload-url menolak file lebih dari 2 MB sebelum URL dibuat', async () => {
    const { service, storage } = setup();

    await expect(
      service.createPhotoUpload(IDS.user, {
        contentType: 'image/png',
        size: 2 * MB + 1,
      }),
    ).rejects.toThrow('Ukuran file maksimal 2 MB');
    expect(storage.createPresignedUpload).not.toHaveBeenCalled();
  });

  it('upload-url: key employees/<id>/avatar-<uuid>, batas 2 MB dikunci di policy', async () => {
    const { service, storage } = setup();

    const result = await service.createPhotoUpload(IDS.user, {
      contentType: 'image/jpeg',
      size: 300_000,
    });

    const [key, contentType, maxBytes] =
      storage.createPresignedUpload.mock.calls[0];
    expect(key).toMatch(
      new RegExp(`^employees/${IDS.employee}/avatar-[0-9a-f-]{36}$`),
    );
    expect(contentType).toBe('image/jpeg');
    expect(maxBytes).toBe(2 * MB);
    expect(result).toMatchObject({
      key,
      method: 'POST',
      maxBytes: 2 * MB,
      expiresAt: '2026-11-26T03:05:00.000Z',
    });
  });

  it.each([
    [
      'milik karyawan lain',
      `employees/${IDS.user}/avatar-1b4e28ba-2fa1-4d2e-8f3a-0123456789ab`,
    ],
    ['di luar folder employees', 'payroll/slip.pdf'],
    [
      'path traversal',
      `employees/${IDS.employee}/../x/avatar-1b4e28ba-2fa1-4d2e-8f3a-0123456789ab`,
    ],
    ['format bukan avatar-<uuid>', `employees/${IDS.employee}/avatar.png`],
  ])('konfirmasi menolak key %s', async (_label, key) => {
    const { service, storage, employee } = setup();

    await expect(service.confirmPhoto(IDS.user, key)).rejects.toThrow(
      new BadRequestException(EmployeeMessages.invalidPhotoKey),
    );
    expect(storage.stat).not.toHaveBeenCalled();
    expect(employee.update).not.toHaveBeenCalled();
  });

  it('konfirmasi sebelum file diunggah: 400', async () => {
    const { service, storage } = setup();
    storage.stat.mockResolvedValue(null);

    await expect(service.confirmPhoto(IDS.user, ownKey)).rejects.toThrow(
      EmployeeMessages.photoNotUploaded,
    );
  });

  it('isi file bukan JPG/PNG (magic bytes): file dihapus, 400', async () => {
    const { service, storage, employee } = setup();
    storage.stat.mockResolvedValue({ size: 500, contentType: 'image/png' });
    storage.readStart.mockResolvedValue(new TextEncoder().encode('<html>'));

    await expect(service.confirmPhoto(IDS.user, ownKey)).rejects.toThrow(
      EmployeeMessages.invalidPhotoFile,
    );
    expect(storage.delete).toHaveBeenCalledWith(ownKey);
    expect(employee.update).not.toHaveBeenCalled();
  });

  it('file di storage lebih dari 2 MB: dihapus tanpa dibaca, 400', async () => {
    const { service, storage } = setup();
    storage.stat.mockResolvedValue({
      size: 2 * MB + 1,
      contentType: 'image/png',
    });

    await expect(service.confirmPhoto(IDS.user, ownKey)).rejects.toThrow(
      EmployeeMessages.invalidPhotoFile,
    );
    expect(storage.readStart).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledWith(ownKey);
  });

  it('berhasil: photoKey diganti, audit dicatat, foto lama dihapus, photoUrl presigned', async () => {
    const { service, storage, employee, audit } = setup(
      employeeRow({ photoKey: oldKey }),
    );
    storage.stat.mockResolvedValue({ size: 1000, contentType: 'image/png' });
    storage.readStart.mockResolvedValue(PNG);

    const result = await service.confirmPhoto(IDS.user, ownKey);

    expect(firstArgs(employee.update)).toMatchObject({
      where: { id: IDS.employee },
      data: { photoKey: ownKey },
    });
    expect(audit.recordChange.mock.calls[0][0]).toMatchObject({
      before: { photoKey: oldKey },
      after: { photoKey: ownKey },
    });
    expect(storage.delete).toHaveBeenCalledWith(oldKey);
    expect(storage.delete).not.toHaveBeenCalledWith(ownKey);
    expect(result.photoUrl).toBe(`https://storage.test/${ownKey}?signed=1`);
  });

  it('gagal menghapus foto lama tidak menggagalkan request', async () => {
    const { service, storage } = setup(employeeRow({ photoKey: oldKey }));
    storage.stat.mockResolvedValue({ size: 1000, contentType: 'image/png' });
    storage.readStart.mockResolvedValue(PNG);
    storage.delete.mockRejectedValue(new Error('storage mati'));
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    await expect(service.confirmPhoto(IDS.user, ownKey)).resolves.toMatchObject(
      { id: IDS.employee },
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
