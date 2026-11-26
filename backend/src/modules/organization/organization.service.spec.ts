import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { type QueryArgs, queryMock } from '../../../test/fixtures/employees.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import { DepartmentsService } from './departments.service.js';
import { OrganizationMessages } from './organization.constants.js';
import { PositionsService } from './positions.service.js';

const DEPT = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e01';
const OTHER_DEPT = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e05';
const POS = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e02';
const at = new Date('2026-11-25T01:00:00.000Z');

function setup() {
  const model = () => ({
    findMany: queryMock().mockResolvedValue([]),
    findUnique: queryMock().mockResolvedValue(null),
    findFirst: queryMock().mockResolvedValue(null),
    create: queryMock(),
    update: queryMock(),
    delete: queryMock().mockResolvedValue({}),
  });
  const client = {
    department: model(),
    position: model(),
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
  return {
    client,
    audit,
    departments: new DepartmentsService(
      prisma,
      audit as unknown as AuditService,
    ),
    positions: new PositionsService(prisma, audit as unknown as AuditService),
  };
}

const firstArgs = (mock: { mock: { calls: QueryArgs[][] } }) =>
  mock.mock.calls[0][0];

const positionRow = (overrides: Record<string, unknown> = {}) => ({
  id: POS,
  name: 'Backend Developer',
  departmentId: DEPT,
  createdAt: at,
  updatedAt: at,
  department: { id: DEPT, name: 'Teknologi Informasi' },
  _count: { employees: 0 },
  ...overrides,
});

describe('DepartmentsService', () => {
  it('hapus departemen yang masih dipakai: 409 dengan jumlah karyawan (termasuk nonaktif) dan jabatan', async () => {
    const { departments, client } = setup();
    client.department.findUnique.mockResolvedValue({
      id: DEPT,
      name: 'Teknologi Informasi',
      _count: { employees: 3, positions: 2 },
    });

    const error = await departments.remove(DEPT).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      message:
        'Departemen masih dipakai oleh 3 karyawan (termasuk nonaktif) dan 2 jabatan. Pindahkan atau hapus dulu.',
      details: { employeeCount: 3, positionCount: 2 },
    });
    // Hitungan pemakai tanpa filter soft delete: karyawan nonaktif ikut dihitung.
    expect(firstArgs(client.department.findUnique).select).toMatchObject({
      _count: { select: { employees: true, positions: true } },
    });
    expect(client.department.delete).not.toHaveBeenCalled();
  });

  it('hapus departemen yang tidak dipakai: terhapus dan dicatat audit', async () => {
    const { departments, client, audit } = setup();
    client.department.findUnique.mockResolvedValue({
      id: DEPT,
      name: 'Riset',
      _count: { employees: 0, positions: 0 },
    });

    await departments.remove(DEPT);

    expect(firstArgs(client.department.delete).where).toEqual({ id: DEPT });
    expect(audit.recordChange).toHaveBeenCalledWith(
      { entity: 'Department', entityId: DEPT, before: { name: 'Riset' } },
      client,
    );
  });

  it('hapus departemen yang tidak ada: 404', async () => {
    const { departments } = setup();

    await expect(departments.remove(DEPT)).rejects.toThrow(
      new NotFoundException(OrganizationMessages.departmentNotFound),
    );
  });

  it('nama departemen unik tanpa membedakan huruf besar/kecil: 409', async () => {
    const { departments, client } = setup();
    client.department.findFirst.mockResolvedValue({ id: OTHER_DEPT });

    await expect(
      departments.create({ name: 'teknologi informasi' }),
    ).rejects.toThrow(
      new ConflictException(OrganizationMessages.departmentNameTaken),
    );
    expect(firstArgs(client.department.findFirst).where).toEqual({
      name: { equals: 'teknologi informasi', mode: 'insensitive' },
    });
  });

  it('daftar departemen menghitung karyawan aktif saja', async () => {
    const { departments, client } = setup();
    client.department.findMany.mockResolvedValue([
      {
        id: DEPT,
        name: 'Teknologi Informasi',
        createdAt: at,
        updatedAt: at,
        _count: { employees: 5, positions: 3 },
      },
    ]);

    await expect(departments.list()).resolves.toEqual([
      {
        id: DEPT,
        name: 'Teknologi Informasi',
        employeeCount: 5,
        positionCount: 3,
        createdAt: at.toISOString(),
        updatedAt: at.toISOString(),
      },
    ]);
    expect(firstArgs(client.department.findMany).select).toMatchObject({
      _count: { select: { employees: { where: { deletedAt: null } } } },
    });
  });
});

describe('PositionsService', () => {
  it('hapus jabatan yang masih dipakai: 409 dengan jumlah karyawan', async () => {
    const { positions, client } = setup();
    client.position.findUnique
      .mockResolvedValueOnce(positionRow())
      .mockResolvedValueOnce({ _count: { employees: 4 } });

    const error = await positions.remove(POS).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      details: { employeeCount: 4 },
    });
    expect(client.position.delete).not.toHaveBeenCalled();
  });

  it('pindah departemen ditolak 409 jika jabatan masih dipakai karyawan', async () => {
    const { positions, client } = setup();
    client.position.findUnique
      .mockResolvedValueOnce(positionRow())
      .mockResolvedValueOnce({ _count: { employees: 1 } });
    client.department.findUnique.mockResolvedValue({ id: OTHER_DEPT });

    await expect(
      positions.update(POS, { departmentId: OTHER_DEPT }),
    ).rejects.toThrow(ConflictException);
    expect(client.position.update).not.toHaveBeenCalled();
  });

  it('ganti nama saja boleh walau dipakai karyawan; audit hanya field yang berubah', async () => {
    const { positions, client, audit } = setup();
    client.position.findUnique.mockResolvedValue(positionRow());
    client.position.update.mockResolvedValue(
      positionRow({ name: 'Backend Engineer' }),
    );

    await positions.update(POS, { name: 'Backend Engineer' });

    expect(firstArgs(client.position.update).data).toEqual({
      name: 'Backend Engineer',
    });
    expect(audit.recordChange.mock.calls[0][0]).toEqual({
      entity: 'Position',
      entityId: POS,
      before: { name: 'Backend Developer' },
      after: { name: 'Backend Engineer' },
    });
  });

  it('buat jabatan di departemen yang tidak ada: 400', async () => {
    const { positions } = setup();

    await expect(
      positions.create({ name: 'QA', departmentId: OTHER_DEPT }),
    ).rejects.toThrow(
      new BadRequestException(OrganizationMessages.departmentNotFound),
    );
  });

  it('nama jabatan unik di dalam departemennya: 409', async () => {
    const { positions, client } = setup();
    client.department.findUnique.mockResolvedValue({ id: DEPT });
    client.position.findFirst.mockResolvedValue({ id: 'lain' });

    await expect(
      positions.create({ name: 'backend developer', departmentId: DEPT }),
    ).rejects.toThrow(
      new ConflictException(OrganizationMessages.positionNameTaken),
    );
    expect(firstArgs(client.position.findFirst).where).toEqual({
      departmentId: DEPT,
      name: { equals: 'backend developer', mode: 'insensitive' },
    });
  });
});
