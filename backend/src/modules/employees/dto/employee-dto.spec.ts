import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  UpdateMyProfileDto,
} from './employee-request.dto.js';
import { ListEmployeesQueryDto } from './list-employees-query.dto.js';

/** Sama dengan ValidationPipe global (app.setup.ts). */
async function check<T extends object>(cls: new () => T, body: object) {
  const instance = plainToInstance(cls, body);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return {
    instance,
    properties: errors.map((error) => error.property),
    messages: errors.flatMap((error) => Object.values(error.constraints ?? {})),
  };
}

const validCreate = {
  email: 'Raditya.Pratama@BlueRose.test ',
  nip: 'BRT-2026-0042',
  fullName: '  Raditya Pratama ',
  departmentId: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e01',
  positionId: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e02',
  officeLocationId: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e03',
  shiftId: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e04',
  joinDate: '2026-12-01',
  employmentStatus: 'CONTRACT',
};

describe('CreateEmployeeDto', () => {
  it('menerima body valid dan merapikan email, NIP, nama', async () => {
    const { properties, instance } = await check(CreateEmployeeDto, {
      ...validCreate,
      nip: ' brt-2026-0042 ',
    });

    expect(properties).toEqual([]);
    expect(instance.email).toBe('raditya.pratama@bluerose.test');
    expect(instance.nip).toBe('BRT-2026-0042');
    expect(instance.fullName).toBe('Raditya Pratama');
  });

  it.each([
    'BRT-26-0042',
    'BRT-2026-42',
    'XYZ-2026-0042',
    'BRT-2026-00420',
    'BRT20260042',
    '',
  ])('menolak NIP berformat salah: %p', async (nip) => {
    const { properties, messages } = await check(CreateEmployeeDto, {
      ...validCreate,
      nip,
    });

    expect(properties).toEqual(['nip']);
    expect(messages).toContain(
      'NIP harus berformat BRT-YYYY-NNNN, contoh BRT-2026-0001',
    );
  });

  it('menolak tanggal lahir di masa depan dan tanggal yang tidak ada', async () => {
    const { properties } = await check(CreateEmployeeDto, {
      ...validCreate,
      birthDate: '2999-01-01',
      joinDate: '2026-02-30',
    });

    expect(properties.sort()).toEqual(['birthDate', 'joinDate']);
  });

  it('menolak field di luar DTO (misalnya passwordHash, isActive)', async () => {
    const { properties } = await check(CreateEmployeeDto, {
      ...validCreate,
      passwordHash: 'x',
      isActive: false,
    });

    expect(properties.sort()).toEqual(['isActive', 'passwordHash']);
  });
});

describe('UpdateEmployeeDto', () => {
  it('field wajib tidak boleh null; phone/gender/birthDate boleh null', async () => {
    const { properties } = await check(UpdateEmployeeDto, {
      fullName: null,
      nip: null,
      departmentId: null,
      phone: null,
      gender: null,
      birthDate: null,
    });

    expect(properties.sort()).toEqual(['departmentId', 'fullName', 'nip']);
  });

  it('role tidak bisa diubah lewat PATCH /employees/:id', async () => {
    const { properties } = await check(UpdateEmployeeDto, { role: 'HR' });

    expect(properties).toEqual(['role']);
  });
});

describe('UpdateMyProfileDto (PATCH /employees/me)', () => {
  it('menerima fullName, phone, gender, birthDate', async () => {
    const { properties, instance } = await check(UpdateMyProfileDto, {
      fullName: 'Raditya',
      phone: '',
      gender: 'MALE',
      birthDate: '1998-04-12',
    });

    expect(properties).toEqual([]);
    expect(instance.phone).toBeNull();
  });

  it.each([
    ['departmentId', '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e01'],
    ['positionId', '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e02'],
    ['role', 'HR'],
    ['nip', 'BRT-2026-0001'],
    ['email', 'lain@bluerose.test'],
    ['employmentStatus', 'PERMANENT'],
    ['photoKey', 'employees/x/avatar-y'],
  ])('menolak %s (data organisasi diatur HR)', async (field, value) => {
    const { properties, messages } = await check(UpdateMyProfileDto, {
      fullName: 'Raditya',
      [field]: value,
    });

    expect(properties).toEqual([field]);
    expect(messages).toEqual([`property ${field} should not exist`]);
  });

  it('menolak nomor telepon tidak valid dan nama kosong', async () => {
    const { properties } = await check(UpdateMyProfileDto, {
      fullName: '   ',
      phone: 'abc',
    });

    expect(properties.sort()).toEqual(['fullName', 'phone']);
  });
});

describe('ListEmployeesQueryDto', () => {
  it('default page 1, limit 20, status active, sort fullName asc', async () => {
    const { properties, instance } = await check(ListEmployeesQueryDto, {});

    expect(properties).toEqual([]);
    expect(instance).toMatchObject({
      page: 1,
      limit: 20,
      status: 'active',
      sort: 'fullName',
      order: 'asc',
    });
  });

  it('query string diubah ke angka; limit maksimal 100', async () => {
    const ok = await check(ListEmployeesQueryDto, { page: '2', limit: '100' });
    expect(ok.properties).toEqual([]);
    expect(ok.instance.limit).toBe(100);

    const tooMany = await check(ListEmployeesQueryDto, { limit: '101' });
    expect(tooMany.messages).toEqual(['limit maksimal 100']);
  });

  it('menolak status/sort di luar pilihan; search kosong diabaikan', async () => {
    const { properties, instance } = await check(ListEmployeesQueryDto, {
      status: 'deleted',
      sort: 'passwordHash',
      search: '   ',
    });

    expect(properties.sort()).toEqual(['sort', 'status']);
    expect(instance.search).toBeUndefined();
  });
});
