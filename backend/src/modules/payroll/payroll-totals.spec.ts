import { Prisma } from '../../generated/prisma/client.js';
import {
  parseEmployerContributions,
  sumItems,
  toConfigSnapshotJson,
  toEmployerContributionsJson,
  toTotalsJson,
} from './payroll-totals.js';

const d = (value: string) => new Prisma.Decimal(value);

const employer = (scale: string) => ({
  BPJS_KES: `${scale}0.00`,
  JHT: `${scale}1.00`,
  JP: `${scale}2.00`,
  JKK: '0.50',
  JKM: '0.25',
  total: '0.00',
});

const item = (net: string, contributions = employer('1')) => ({
  baseSalary: d('100'),
  fixedAllowance: d('10'),
  bonus: d('5'),
  gross: d('115'),
  bpjsKes: d('1'),
  bpjsJht: d('2'),
  bpjsJp: d('1'),
  pph21: d('3'),
  otherDeductions: d('0'),
  net: d(net),
  employerContributions: contributions,
});

describe('payroll-totals', () => {
  it('JSON employerContributions bolak-balik tanpa kehilangan presisi', () => {
    const json = toEmployerContributionsJson(
      parseEmployerContributions({
        BPJS_KES: '480000.00',
        JHT: '555000.00',
        JP: '210948.00',
        JKK: '36000.00',
        JKM: '45000.00',
        total: '1326948.00',
      }),
    );
    expect(json).toEqual({
      BPJS_KES: '480000.00',
      JHT: '555000.00',
      JP: '210948.00',
      JKK: '36000.00',
      JKM: '45000.00',
      total: '1326948.00',
    });
  });

  it('JSON rusak ditolak (bukan dianggap 0)', () => {
    expect(() => parseEmployerContributions(null)).toThrow();
    expect(() => parseEmployerContributions({ BPJS_KES: 480000 })).toThrow(
      /BPJS_KES/,
    );
  });

  it('sumItems menjumlah semua kolom dan bagian perusahaan per program', () => {
    const totals = toTotalsJson(
      sumItems([item('108.10'), item('108.20', employer('2'))]),
    );
    expect(totals).toMatchObject({
      itemCount: 2,
      baseSalary: '200.00',
      gross: '230.00',
      pph21: '6.00',
      net: '216.30',
      employer: {
        BPJS_KES: '30.00',
        JHT: '32.00',
        JP: '34.00',
        JKK: '1.00',
        JKM: '0.50',
      },
    });
  });

  it('periode tanpa slip: semua 0', () => {
    expect(toTotalsJson(sumItems([]))).toMatchObject({
      itemCount: 0,
      net: '0.00',
      employer: { total: '0.00' },
    });
  });

  it('configSnapshot: tarif 4 desimal, cap 2 desimal atau null, tanggal berlaku', () => {
    const row = (wageCap: string | null) => ({
      key: 'JP' as const,
      employeeRate: d('0.01'),
      employerRate: d('0.02'),
      wageCap: wageCap ? d(wageCap) : null,
      effectiveFrom: new Date('2025-03-01T00:00:00.000Z'),
    });
    const snapshot = toConfigSnapshotJson({
      BPJS_KES: { ...row('12000000'), key: 'BPJS_KES' },
      JHT: { ...row(null), key: 'JHT' },
      JP: row('10547400'),
      JKK: { ...row(null), key: 'JKK' },
      JKM: { ...row(null), key: 'JKM' },
    });
    expect(snapshot.JP).toEqual({
      employeeRate: '0.0100',
      employerRate: '0.0200',
      wageCap: '10547400.00',
      effectiveFrom: '2025-03-01',
    });
    expect(snapshot.JHT.wageCap).toBeNull();
  });
});
