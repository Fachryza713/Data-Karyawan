import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  employeeRow,
  IDS,
  type QueryArgs,
  queryMock,
  serializerWith,
  storageMock,
} from '../../../test/fixtures/employees.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { PasswordResetService } from '../auth/password-reset.service.js';
import type { RefreshTokenService } from '../auth/refresh-token.service.js';
import type {
  CreateEmployeeDto,
  UpdateEmployeeDto,
} from './dto/employee-request.dto.js';
import type { ListEmployeesQueryDto } from './dto/list-employees-query.dto.js';
import type { EmployeeInvitationService } from './employee-invitation.service.js';
import { EmployeeMessages, INVITATION_TTL_MS } from './employees.constants.js';
import { EmployeesService } from './employees.service.js';

const hrActor: AuthUser = {
  id: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e99',
  role: 'HR',
  employeeId: null,
};

const createDto: CreateEmployeeDto = {
  email: 'baru@bluerose.test',
  nip: 'BRT-2026-0042',
  fullName: 'Karyawan Baru',
  departmentId: IDS.department,
  positionId: IDS.position,
  officeLocationId: IDS.officeLocation,
  shiftId: IDS.shift,
  joinDate: '2026-12-01',
  employmentStatus: 'CONTRACT',
};

function listQuery(
  overrides: Partial<ListEmployeesQueryDto> = {},
): ListEmployeesQueryDto {
  return {
    page: 1,
    limit: 20,
    status: 'active',
    sort: 'fullName',
    order: 'asc',
    ...overrides,
  };
}

function setup() {
  const employee = {
    findMany: queryMock().mockResolvedValue([]),
    count: queryMock().mockResolvedValue(0),
    findUnique: queryMock().mockResolvedValue(null),
    findFirst: queryMock().mockResolvedValue(null),
    create: queryMock(),
    update: queryMock(),
  };
  const user = {
    findFirst: queryMock().mockResolvedValue(null),
    create: queryMock().mockResolvedValue({ id: IDS.user }),
    update: queryMock().mockResolvedValue({}),
  };
  const found = (id: string) => Promise.resolve({ id });
  const client = {
    employee,
    user,
    department: {
      findUnique: queryMock().mockImplementation((args) =>
        found(args.where!.id as string),
      ),
    },
    position: {
      findUnique: queryMock().mockResolvedValue({
        departmentId: IDS.department,
      }),
    },
    officeLocation: {
      findUnique: queryMock().mockImplementation((args) =>
        found(args.where!.id as string),
      ),
    },
    shift: {
      findUnique: queryMock().mockImplementation((args) =>
        found(args.where!.id as string),
      ),
    },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn(client),
    ),
  };
  const audit = {
    recordChange: jest
      .fn<AuditService['recordChange']>()
      .mockResolvedValue(undefined),
  };
  const passwordReset = {
    issueToken: jest
      .fn<PasswordResetService['issueToken']>()
      .mockResolvedValue('invite-token'),
  };
  const refreshTokens = {
    revokeAllForUser: jest
      .fn<RefreshTokenService['revokeAllForUser']>()
      .mockResolvedValue(2),
  };
  const invitation = {
    send: jest.fn<EmployeeInvitationService['send']>().mockResolvedValue(true),
  };
  const storage = storageMock();

  const service = new EmployeesService(
    { client } as unknown as PrismaService,
    audit as unknown as AuditService,
    serializerWith(storage),
    passwordReset as unknown as PasswordResetService,
    refreshTokens as unknown as RefreshTokenService,
    invitation as unknown as EmployeeInvitationService,
  );
  return {
    service,
    client,
    employee,
    user,
    audit,
    passwordReset,
    refreshTokens,
    invitation,
  };
}

const firstArgs = (mock: { mock: { calls: QueryArgs[][] } }) =>
  mock.mock.calls[0][0];

describe('EmployeesService.list', () => {
  it('default hanya karyawan aktif: karyawan soft delete tidak muncul', async () => {
    const { service, employee } = setup();

    await service.list(listQuery());

    const args = firstArgs(employee.findMany);
    expect(args.where).toEqual({ deletedAt: null });
    expect(firstArgs(employee.count).where).toEqual({ deletedAt: null });
    expect(args.orderBy).toEqual([{ fullName: 'asc' }, { id: 'asc' }]);
    expect(args).toMatchObject({ skip: 0, take: 20 });
  });

  it('status=inactive hanya karyawan yang sudah di-soft delete', async () => {
    const { service, employee } = setup();

    await service.list(listQuery({ status: 'inactive' }));

    expect(firstArgs(employee.findMany).where).toEqual({
      deletedAt: { not: null },
    });
  });

  it('search nama/NIP/email tidak peka huruf besar, plus filter departemen dan jabatan', async () => {
    const { service, employee } = setup();

    await service.list(
      listQuery({
        search: 'radit',
        departmentId: IDS.department,
        positionId: IDS.position,
        sort: 'joinDate',
        order: 'desc',
      }),
    );

    const args = firstArgs(employee.findMany);
    expect(args.where).toEqual({
      deletedAt: null,
      departmentId: IDS.department,
      positionId: IDS.position,
      OR: [
        { fullName: { contains: 'radit', mode: 'insensitive' } },
        { nip: { contains: 'radit', mode: 'insensitive' } },
        { user: { email: { contains: 'radit', mode: 'insensitive' } } },
      ],
    });
    expect(args.orderBy).toEqual([{ joinDate: 'desc' }, { id: 'asc' }]);
  });

  it('pagination: skip/take dan meta { page, limit, total, totalPages }', async () => {
    const { service, employee } = setup();
    employee.findMany.mockResolvedValue([employeeRow()]);
    employee.count.mockResolvedValue(25);

    const result = await service.list(listQuery({ page: 3, limit: 10 }));

    expect(firstArgs(employee.findMany)).toMatchObject({ skip: 20, take: 10 });
    expect(result.meta).toEqual({
      page: 3,
      limit: 10,
      total: 25,
      totalPages: 3,
    });
  });

  it('response memakai serializer: photoUrl presigned, tanpa photoKey/passwordHash', async () => {
    const { service, employee } = setup();
    employee.findMany.mockResolvedValue([
      employeeRow({ photoKey: `employees/${IDS.employee}/avatar-1` }),
    ]);
    employee.count.mockResolvedValue(1);

    const { data } = await service.list(listQuery());

    expect(data[0]).toMatchObject({
      id: IDS.employee,
      email: 'raditya@bluerose.test',
      birthDate: '1998-04-12',
      joinDate: '2024-03-01',
      isActive: true,
      photoUrl: `https://storage.test/employees/${IDS.employee}/avatar-1?signed=1`,
    });
    expect(data[0]).not.toHaveProperty('photoKey');
    expect(data[0]).not.toHaveProperty('user');
    expect(JSON.stringify(data)).not.toContain('passwordHash');
  });
});

describe('EmployeesService.create', () => {
  it('NIP sudah dipakai (termasuk karyawan nonaktif): 409, tidak membuat akun', async () => {
    const { service, employee, user } = setup();
    employee.findFirst.mockResolvedValue({ id: 'lain' });

    await expect(service.create(createDto)).rejects.toThrow(
      new ConflictException(EmployeeMessages.nipTaken),
    );

    const where = firstArgs(employee.findFirst).where!;
    expect(where.nip).toBe('BRT-2026-0042');
    // INCLUDE_DELETED: filter soft delete dimatikan untuk cek unik.
    expect(Object.hasOwn(where, 'deletedAt')).toBe(true);
    expect(where.deletedAt).toBeUndefined();
    expect(user.create).not.toHaveBeenCalled();
  });

  it('NIP dari DTO dirapikan sebelum dicek unik', async () => {
    const { service, employee } = setup();
    employee.findFirst.mockResolvedValue({ id: 'lain' });

    await expect(
      service.create({ ...createDto, nip: ' brt-2026-0042 ' }),
    ).rejects.toThrow(ConflictException);
    expect(firstArgs(employee.findFirst).where!.nip).toBe('BRT-2026-0042');
  });

  it('email sudah dipakai: 409', async () => {
    const { service, user } = setup();
    user.findFirst.mockResolvedValue({ id: 'lain' });

    await expect(
      service.create({ ...createDto, email: 'Baru@BlueRose.test' }),
    ).rejects.toThrow(new ConflictException(EmployeeMessages.emailTaken));
    expect(firstArgs(user.findFirst).where).toEqual({
      email: 'baru@bluerose.test',
    });
  });

  it('jabatan bukan milik departemen yang dipilih: 400', async () => {
    const { service, client, user } = setup();
    client.position.findUnique.mockResolvedValue({
      departmentId: IDS.otherDepartment,
    });

    await expect(service.create(createDto)).rejects.toThrow(
      new BadRequestException(EmployeeMessages.positionOutsideDepartment),
    );
    expect(user.create).not.toHaveBeenCalled();
  });

  it('departemen tidak ada: 400', async () => {
    const { service, client } = setup();
    client.department.findUnique.mockResolvedValue(null);

    await expect(service.create(createDto)).rejects.toThrow(
      new BadRequestException(EmployeeMessages.departmentNotFound),
    );
  });

  it('membuat User + Employee dalam satu transaksi, token undangan 72 jam, audit, lalu email', async () => {
    const {
      service,
      client,
      employee,
      user,
      passwordReset,
      audit,
      invitation,
    } = setup();
    employee.create.mockResolvedValue(
      employeeRow({ nip: 'BRT-2026-0042', fullName: 'Karyawan Baru' }),
    );

    const result = await service.create(createDto);

    expect(client.$transaction).toHaveBeenCalledTimes(1);
    const userData = firstArgs(user.create).data!;
    expect(userData).toMatchObject({
      email: 'baru@bluerose.test',
      role: 'EMPLOYEE',
    });
    // Password acak (argon2id), bukan teks yang bisa ditebak.
    expect(userData.passwordHash).toMatch(/^\$argon2id\$/);
    expect(firstArgs(employee.create).data).toMatchObject({
      userId: IDS.user,
      nip: 'BRT-2026-0042',
      joinDate: new Date('2026-12-01T00:00:00.000Z'),
      birthDate: null,
      phone: null,
    });
    expect(passwordReset.issueToken).toHaveBeenCalledWith(
      IDS.user,
      INVITATION_TTL_MS,
      client,
    );
    const [change, tx] = audit.recordChange.mock.calls[0];
    expect(tx).toBe(client);
    expect(change).toMatchObject({
      entity: 'Employee',
      entityId: IDS.employee,
      after: { nip: 'BRT-2026-0042', email: 'raditya@bluerose.test' },
    });
    expect(invitation.send).toHaveBeenCalledWith(
      { email: 'baru@bluerose.test', fullName: 'Karyawan Baru' },
      'invite-token',
    );
    expect(result).toMatchObject({ id: IDS.employee, invitationSent: true });
  });

  it('email undangan gagal: karyawan tetap dibuat, invitationSent false', async () => {
    const { service, employee, invitation } = setup();
    employee.create.mockResolvedValue(employeeRow());
    invitation.send.mockResolvedValue(false);

    await expect(service.create(createDto)).resolves.toMatchObject({
      invitationSent: false,
    });
  });
});

describe('EmployeesService.update', () => {
  it('NIP baru sudah dipakai karyawan lain: 409 (dicek selain dirinya sendiri)', async () => {
    const { service, employee } = setup();
    employee.findUnique.mockResolvedValue(employeeRow());
    employee.findFirst.mockResolvedValue({ id: 'lain' });

    await expect(
      service.update(IDS.employee, { nip: 'BRT-2026-0001' }),
    ).rejects.toThrow(new ConflictException(EmployeeMessages.nipTaken));
    expect(firstArgs(employee.findFirst).where).toMatchObject({
      nip: 'BRT-2026-0001',
      id: { not: IDS.employee },
    });
    expect(employee.update).not.toHaveBeenCalled();
  });

  it('NIP sama dengan miliknya sendiri tidak dicek ulang dan tidak dianggap berubah', async () => {
    const { service, employee, audit } = setup();
    employee.findUnique.mockResolvedValue(employeeRow());
    employee.update.mockResolvedValue(employeeRow({ fullName: 'Raditya P.' }));

    await service.update(IDS.employee, {
      nip: 'brt-2024-0003',
      fullName: 'Raditya P.',
    });

    expect(employee.findFirst).not.toHaveBeenCalled();
    expect(firstArgs(employee.update).data).toEqual({ fullName: 'Raditya P.' });
    expect(audit.recordChange.mock.calls[0][0]).toMatchObject({
      before: { fullName: 'Raditya Pratama' },
      after: { fullName: 'Raditya P.' },
    });
  });

  it('tanpa perubahan: tidak menulis database dan audit', async () => {
    const { service, client, employee, audit } = setup();
    employee.findUnique.mockResolvedValue(employeeRow());

    await service.update(IDS.employee, {
      fullName: 'Raditya Pratama',
      birthDate: '1998-04-12',
    });

    expect(client.$transaction).not.toHaveBeenCalled();
    expect(employee.update).not.toHaveBeenCalled();
    expect(audit.recordChange).not.toHaveBeenCalled();
  });

  it('ganti departemen: jabatan sekarang harus milik departemen baru', async () => {
    const { service, employee } = setup();
    employee.findUnique.mockResolvedValue(employeeRow());

    await expect(
      service.update(IDS.employee, { departmentId: IDS.otherDepartment }),
    ).rejects.toThrow(EmployeeMessages.positionOutsideDepartment);
  });

  it('ganti email mengubah User; phone null mengosongkan nomor', async () => {
    const { service, employee, user } = setup();
    employee.findUnique.mockResolvedValue(employeeRow());
    employee.update.mockResolvedValue(employeeRow());
    const dto: UpdateEmployeeDto = {
      email: 'Raditya.Baru@BlueRose.test',
      phone: null,
    };

    await service.update(IDS.employee, dto);

    expect(firstArgs(user.update)).toEqual({
      where: { id: IDS.user },
      data: { email: 'raditya.baru@bluerose.test' },
    });
    expect(firstArgs(employee.update).data).toEqual({ phone: null });
  });

  it('karyawan nonaktif/tidak ada: 404', async () => {
    const { service } = setup();

    await expect(
      service.update(IDS.employee, { fullName: 'X' }),
    ).rejects.toThrow(new NotFoundException(EmployeeMessages.notFound));
  });
});

describe('EmployeesService.remove (soft delete)', () => {
  const status = (overrides: Record<string, unknown> = {}) => ({
    id: IDS.employee,
    userId: IDS.user,
    deletedAt: null,
    user: { isActive: true },
    ...overrides,
  });

  it('isi deletedAt, nonaktifkan akun, cabut semua refresh token, catat audit', async () => {
    const { service, client, employee, user, refreshTokens, audit } = setup();
    employee.findUnique.mockResolvedValue(status());

    await service.remove(IDS.employee, hrActor);

    const update = firstArgs(employee.update);
    expect(update.where).toEqual({ id: IDS.employee });
    expect(update.data!.deletedAt).toBeInstanceOf(Date);
    expect(firstArgs(user.update)).toEqual({
      where: { id: IDS.user },
      data: { isActive: false },
    });
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(
      IDS.user,
      client,
    );
    expect(audit.recordChange.mock.calls[0][0]).toMatchObject({
      entityId: IDS.employee,
      before: { deletedAt: null, isActive: true },
      after: { isActive: false, revokedSessions: 2 },
    });
  });

  it('sudah nonaktif: 409', async () => {
    const { service, employee } = setup();
    employee.findUnique.mockResolvedValue(status({ deletedAt: new Date() }));

    await expect(service.remove(IDS.employee, hrActor)).rejects.toThrow(
      new ConflictException(EmployeeMessages.alreadyInactive),
    );
  });

  it('HR tidak bisa menonaktifkan akunnya sendiri', async () => {
    const { service, employee } = setup();
    employee.findUnique.mockResolvedValue(status({ userId: hrActor.id }));

    await expect(service.remove(IDS.employee, hrActor)).rejects.toThrow(
      new BadRequestException(EmployeeMessages.cannotDeactivateSelf),
    );
    expect(employee.update).not.toHaveBeenCalled();
  });

  it('tidak ada: 404', async () => {
    const { service } = setup();

    await expect(service.remove(IDS.employee, hrActor)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('EmployeesService.restore', () => {
  it('aktifkan lagi karyawan dan akunnya', async () => {
    const { service, employee, user, audit } = setup();
    employee.findUnique.mockResolvedValue({
      id: IDS.employee,
      userId: IDS.user,
      deletedAt: new Date('2026-11-20T00:00:00.000Z'),
      user: { isActive: false },
    });
    employee.update.mockResolvedValue(employeeRow());

    await expect(service.restore(IDS.employee)).resolves.toMatchObject({
      isActive: true,
    });
    expect(firstArgs(employee.update)).toMatchObject({
      where: { id: IDS.employee, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    expect(firstArgs(user.update).data).toEqual({ isActive: true });
    expect(audit.recordChange).toHaveBeenCalled();
  });

  it('masih aktif: 409', async () => {
    const { service, employee } = setup();
    employee.findUnique.mockResolvedValue({
      id: IDS.employee,
      userId: IDS.user,
      deletedAt: null,
      user: { isActive: true },
    });

    await expect(service.restore(IDS.employee)).rejects.toThrow(
      new ConflictException(EmployeeMessages.stillActive),
    );
  });
});
