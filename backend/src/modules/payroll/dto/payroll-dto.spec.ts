import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateBenefitDto,
  CreatePayrollPeriodDto,
  CreateSalaryStructureDto,
  ReopenPayrollPeriodDto,
  UpdateBenefitDto,
  UpdatePayrollConfigsDto,
  UpdatePayrollItemDto,
} from './payroll-request.dto.js';

/** Sama dengan ValidationPipe global (app.setup.ts). */
async function check<T extends object>(cls: new () => T, body: object) {
  const instance = plainToInstance(cls, body);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const flatten = (list: typeof errors, prefix = ''): string[] =>
    list.flatMap((error) => [
      ...(error.constraints ? [`${prefix}${error.property}`] : []),
      ...flatten(error.children ?? [], `${prefix}${error.property}.`),
    ]);
  return { instance, properties: flatten(errors) };
}

describe('CreateSalaryStructureDto', () => {
  const valid = {
    baseSalary: '8500000',
    fixedAllowance: '1000000.50',
    bankName: ' BCA ',
    bankAccountLast4: '8821',
    effectiveFrom: '2026-12-01',
  };

  it('uang sebagai teks diterima; bankName di-trim', async () => {
    const { properties, instance } = await check(
      CreateSalaryStructureDto,
      valid,
    );
    expect(properties).toEqual([]);
    expect(instance.bankName).toBe('BCA');
  });

  it('uang sebagai angka JSON (float) ditolak', async () => {
    const { properties } = await check(CreateSalaryStructureDto, {
      ...valid,
      baseSalary: 8500000,
      fixedAllowance: 1000000.5,
    });
    expect(properties.sort()).toEqual(['baseSalary', 'fixedAllowance']);
  });

  it('negatif, 3 desimal, rekening bukan 4 digit, tanggal salah', async () => {
    const { properties } = await check(CreateSalaryStructureDto, {
      baseSalary: '-1',
      fixedAllowance: '1.005',
      bankName: '',
      bankAccountLast4: '12345',
      effectiveFrom: '2026-02-30',
    });
    expect(properties.sort()).toEqual([
      'bankAccountLast4',
      'bankName',
      'baseSalary',
      'effectiveFrom',
      'fixedAllowance',
    ]);
  });

  it('employeeId dari body ditolak (diambil dari path)', async () => {
    const { properties } = await check(CreateSalaryStructureDto, {
      ...valid,
      employeeId: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e10',
    });
    expect(properties).toEqual(['employeeId']);
  });
});

describe('Benefit DTO', () => {
  it('create: provider wajib, dependents 0-20, status enum', async () => {
    const { properties } = await check(CreateBenefitDto, {
      provider: '  ',
      dependents: 21,
      status: 'AKTIF',
    });
    expect(properties.sort()).toEqual(['dependents', 'provider', 'status']);
  });

  it('update: program/cardNo/class boleh null, provider tidak', async () => {
    expect(
      (
        await check(UpdateBenefitDto, {
          program: null,
          cardNo: null,
          class: null,
        })
      ).properties,
    ).toEqual([]);
    expect(
      (await check(UpdateBenefitDto, { provider: null })).properties,
    ).toEqual(['provider']);
  });
});

describe('UpdatePayrollConfigsDto', () => {
  const config = {
    key: 'JP',
    employeeRate: '0.01',
    employerRate: '0.02',
    wageCap: '10547400',
  };

  it('tarif pecahan teks dan wageCap null diterima', async () => {
    const { properties } = await check(UpdatePayrollConfigsDto, {
      effectiveFrom: '2026-03-01',
      configs: [config, { ...config, key: 'JHT', wageCap: null }],
    });
    expect(properties).toEqual([]);
  });

  it('tarif > 1, tarif angka, key salah, wageCap tidak dikirim', async () => {
    const { properties } = await check(UpdatePayrollConfigsDto, {
      effectiveFrom: '2026-03-01',
      configs: [
        { key: 'JP', employeeRate: '1.5', employerRate: 0.02, wageCap: '1' },
        { key: 'PPH', employeeRate: '0', employerRate: '0' },
      ],
    });
    expect(properties.sort()).toEqual([
      'configs.0.employeeRate',
      'configs.0.employerRate',
      'configs.1.key',
      'configs.1.wageCap',
    ]);
  });

  it('configs kosong ditolak', async () => {
    const { properties } = await check(UpdatePayrollConfigsDto, {
      effectiveFrom: '2026-03-01',
      configs: [],
    });
    expect(properties).toEqual(['configs']);
  });
});

describe('Periode dan slip DTO', () => {
  it('period YYYY-MM', async () => {
    expect(
      (await check(CreatePayrollPeriodDto, { period: '2026-11' })).properties,
    ).toEqual([]);
    expect(
      (await check(CreatePayrollPeriodDto, { period: '2026-13' })).properties,
    ).toEqual(['period']);
  });

  it('reopen wajib alasan', async () => {
    expect(
      (await check(ReopenPayrollPeriodDto, { reason: '  ' })).properties,
    ).toEqual(['reason']);
  });

  it('slip: uang teks, note null boleh; bonus null atau angka ditolak', async () => {
    expect(
      (await check(UpdatePayrollItemDto, { bonus: '1500000', note: null }))
        .properties,
    ).toEqual([]);
    const { properties } = await check(UpdatePayrollItemDto, {
      bonus: null,
      pph21: 250000,
      gross: '1',
    });
    expect(properties.sort()).toEqual(['bonus', 'gross', 'pph21']);
  });
});
