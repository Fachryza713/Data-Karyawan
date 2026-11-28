import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import {
  assertAllScored,
  assertCanAddIndicator,
  assertCompleteScoreSet,
  assertNoTemplateGaps,
  assertPeriodDates,
  assertPeriodEditable,
  assertPeriodTransition,
  assertReviewScorable,
  computeFinalScore,
  daysUntil,
  findTemplateGaps,
  gradeFor,
  hasDuplicateName,
  isTemplateValid,
  parsePercent,
  previewResult,
  sumWeights,
  templateProblem,
} from './kpi-rules.js';
import { KpiMessages, PERCENT_PATTERN } from './kpi.constants.js';

const d = (value: string) => new Prisma.Decimal(value);
const weights = (...values: string[]) => values.map(d);

describe('bobot template', () => {
  it('33,33 + 33,33 + 33,34 = 100: valid (Decimal, bukan float)', () => {
    expect(sumWeights(weights('33.33', '33.33', '33.34')).toFixed(2)).toBe(
      '100.00',
    );
    expect(isTemplateValid(weights('33.33', '33.33', '33.34'))).toBe(true);
  });

  it('33,33 x 3 = 99,99: tidak valid', () => {
    expect(templateProblem(weights('33.33', '33.33', '33.33'))).toBe(
      'Total bobot 99.99, harus 100.00',
    );
  });

  it('jumlah yang meleset di float tetap tepat 100 dengan Decimal', () => {
    // Di JavaScript 0.01 + 65.4 + 34.59 = 100.00000000000001 (float).
    expect(0.01 + 65.4 + 34.59).not.toBe(100);
    expect(isTemplateValid(weights('0.01', '65.4', '34.59'))).toBe(true);
    expect(isTemplateValid(weights('10.1', '20.2', '69.7'))).toBe(true);
  });

  it('lebih dari 100 atau tanpa indikator: tidak valid', () => {
    expect(templateProblem(weights('60', '40.01'))).toBe(
      'Total bobot 100.01, harus 100.00',
    );
    expect(templateProblem([])).toBe('Belum ada indikator');
    expect(isTemplateValid(weights('100'))).toBe(true);
  });

  it.each(['0', '0.01', '33.33', '99.99', '100', '100.00', '87.5'])(
    'persen "%s" diterima',
    (value) => {
      expect(PERCENT_PATTERN.test(value)).toBe(true);
      expect(parsePercent(value).toString()).toBe(d(value).toString());
    },
  );

  it.each(['100.01', '101', '-1', '33.333', '1e2', ' 50', '', '50.'])(
    'persen "%s" ditolak',
    (value) => {
      expect(PERCENT_PATTERN.test(value)).toBe(false);
      expect(() => parsePercent(value)).toThrow(RangeError);
    },
  );

  it('maksimal 20 indikator dan nama unik (tanpa beda huruf besar/kecil)', () => {
    expect(() => assertCanAddIndicator(19)).not.toThrow();
    expect(() => assertCanAddIndicator(20)).toThrow(
      UnprocessableEntityException,
    );
    expect(hasDuplicateName(['Kualitas', 'Kecepatan'])).toBe(false);
    expect(hasDuplicateName(['Kualitas', ' kualitas '])).toBe(true);
  });
});

describe('nilai akhir dan grade', () => {
  it('jumlah(skor x bobot / 100), dibulatkan 1 desimal', () => {
    // 80 x 0,4 + 90 x 0,35 + 70 x 0,25 = 32 + 31,5 + 17,5 = 81
    expect(
      computeFinalScore([
        { score: d('80'), weight: d('40') },
        { score: d('90'), weight: d('35') },
        { score: d('70'), weight: d('25') },
      ]).toString(),
    ).toBe('81');
    // 87,5 x 0,3333 + 72,25 x 0,3333 + 64 x 0,3334 = 74,59...
    expect(
      computeFinalScore([
        { score: d('87.5'), weight: d('33.33') },
        { score: d('72.25'), weight: d('33.33') },
        { score: d('64'), weight: d('33.34') },
      ]).toFixed(1),
    ).toBe('74.6');
  });

  it('pembulatan ROUND_HALF_UP sekali di akhir: x,x5 naik', () => {
    // 84,95 -> 85,0 (A), 69,94 -> 69,9 (C)
    expect(
      computeFinalScore([{ score: d('84.95'), weight: d('100') }]).toFixed(1),
    ).toBe('85.0');
    expect(
      computeFinalScore([{ score: d('69.94'), weight: d('100') }]).toFixed(1),
    ).toBe('69.9');
    // 42,44 + 42,44 = 84,88 -> 84,9. Membulatkan per indikator dulu
    // (42,4 + 42,4) akan memberi 84,8.
    expect(
      computeFinalScore([
        { score: d('84.88'), weight: d('50') },
        { score: d('84.88'), weight: d('50') },
      ]).toFixed(1),
    ).toBe('84.9');
  });

  it.each([
    ['100', 'A'],
    ['85', 'A'],
    ['85.0', 'A'],
    ['84.9', 'B'],
    ['70', 'B'],
    ['69.9', 'C'],
    ['55', 'C'],
    ['54.9', 'D'],
    ['0', 'D'],
  ])('nilai %s -> grade %s', (score, grade) => {
    expect(gradeFor(d(score))).toBe(grade);
  });

  it('84,95 dibulatkan 85,0 lalu mendapat A (grade dari nilai bulat)', () => {
    const final = computeFinalScore([{ score: d('84.95'), weight: d('100') }]);
    expect(gradeFor(final)).toBe('A');
  });

  it('perkiraan hanya jika semua skor terisi', () => {
    expect(
      previewResult([
        { score: d('90'), weight: d('50') },
        { score: null, weight: d('50') },
      ]),
    ).toBeNull();
    expect(previewResult([])).toBeNull();
    const preview = previewResult([
      { score: d('90'), weight: d('50') },
      { score: d('80'), weight: d('50') },
    ]);
    expect(preview?.finalScore.toFixed(1)).toBe('85.0');
    expect(preview?.grade).toBe('A');
  });
});

describe('aktivasi: jabatan tanpa template valid', () => {
  const position = (
    name: string,
    weightsOrNull: Prisma.Decimal[] | null,
    department = 'Teknologi Informasi',
  ) => ({
    positionId: `id-${name}`,
    positionName: name,
    departmentName: department,
    activeEmployees: 2,
    templateId: weightsOrNull ? `tpl-${name}` : null,
    weights: weightsOrNull,
  });

  it('melaporkan jabatan tanpa template aktif dan template tidak valid, urut departemen lalu jabatan', () => {
    const gaps = findTemplateGaps([
      position('Frontend Developer', weights('50', '50')),
      position('Staf Logistik', null, 'Operasional'),
      position('Backend Developer', weights('50', '40')),
      position('HR Manager', [], 'Human Capital'),
    ]);

    expect(gaps.map((gap) => [gap.positionName, gap.problem])).toEqual([
      ['HR Manager', 'Belum ada indikator'],
      ['Staf Logistik', 'Belum ada template aktif'],
      ['Backend Developer', 'Total bobot 90.00, harus 100.00'],
    ]);
    expect(gaps[0]).not.toHaveProperty('weights');
  });

  it('422 dengan details.positions; tanpa gap tidak melempar', () => {
    const gaps = findTemplateGaps([position('Staf Logistik', null)]);
    try {
      assertNoTemplateGaps(gaps);
      throw new Error('harus 422');
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toEqual({
        message: KpiMessages.missingTemplates(1, 'Staf Logistik'),
        details: { positions: gaps },
      });
    }
    expect(() => assertNoTemplateGaps([])).not.toThrow();
  });
});

describe('periode', () => {
  it('endDate dan deadline tidak sebelum startDate', () => {
    const ok = {
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      deadline: '2026-04-15',
    };
    expect(() => assertPeriodDates(ok)).not.toThrow();
    expect(() => assertPeriodDates({ ...ok, endDate: '2025-12-31' })).toThrow(
      new UnprocessableEntityException(KpiMessages.endBeforeStart),
    );
    expect(() => assertPeriodDates({ ...ok, deadline: '2025-12-31' })).toThrow(
      new UnprocessableEntityException(KpiMessages.deadlineBeforeStart),
    );
    // Tenggat boleh sebelum akhir periode.
    expect(() =>
      assertPeriodDates({ ...ok, deadline: '2026-03-01' }),
    ).not.toThrow();
  });

  it('DRAFT semua field, ACTIVE hanya deadline, CLOSED terkunci', () => {
    expect(() =>
      assertPeriodEditable('DRAFT', ['name', 'startDate']),
    ).not.toThrow();
    expect(() => assertPeriodEditable('ACTIVE', ['deadline'])).not.toThrow();
    expect(() => assertPeriodEditable('ACTIVE', ['deadline', 'name'])).toThrow(
      new ConflictException(KpiMessages.activeOnlyDeadline),
    );
    expect(() => assertPeriodEditable('CLOSED', ['deadline'])).toThrow(
      new ConflictException(KpiMessages.closedLocked),
    );
  });

  it('transisi DRAFT -> ACTIVE -> CLOSED saja', () => {
    expect(() => assertPeriodTransition('DRAFT', 'ACTIVE')).not.toThrow();
    expect(() => assertPeriodTransition('ACTIVE', 'CLOSED')).not.toThrow();
    expect(() => assertPeriodTransition('ACTIVE', 'ACTIVE')).toThrow(
      ConflictException,
    );
    expect(() => assertPeriodTransition('CLOSED', 'ACTIVE')).toThrow(
      ConflictException,
    );
    expect(() => assertPeriodTransition('DRAFT', 'CLOSED')).toThrow(
      ConflictException,
    );
  });

  it('hari menuju tenggat (negatif = lewat)', () => {
    expect(daysUntil('2026-04-10', '2026-04-15')).toBe(5);
    expect(daysUntil('2026-04-15', '2026-04-15')).toBe(0);
    expect(daysUntil('2026-04-17', '2026-04-15')).toBe(-2);
    expect(daysUntil('2026-02-28', '2026-03-01')).toBe(1);
  });
});

describe('penilaian', () => {
  const review = {
    status: 'DRAFT' as const,
    periodStatus: 'ACTIVE' as const,
    periodName: 'Q1 2026',
    employeeUserId: 'user-karyawan',
  };

  it('DRAFT di periode ACTIVE oleh HR lain: boleh', () => {
    expect(() => assertReviewScorable(review, 'user-hr')).not.toThrow();
  });

  it('FINAL: skor terkunci (409)', () => {
    expect(() =>
      assertReviewScorable({ ...review, status: 'FINAL' }, 'user-hr'),
    ).toThrow(new ConflictException(KpiMessages.reviewFinal));
  });

  it.each(['DRAFT', 'CLOSED'] as const)('periode %s: 409', (periodStatus) => {
    expect(() =>
      assertReviewScorable({ ...review, periodStatus }, 'user-hr'),
    ).toThrow(new ConflictException(KpiMessages.periodNotActive('Q1 2026')));
  });

  it('HR menilai KPI dirinya sendiri: 403', () => {
    expect(() => assertReviewScorable(review, 'user-karyawan')).toThrow(
      new ForbiddenException(KpiMessages.ownReview),
    );
  });

  const indicators = [
    { indicatorId: 'i1', name: 'Kualitas' },
    { indicatorId: 'i2', name: 'Kecepatan' },
  ];

  it('skor lengkap tepat satu per indikator: lolos', () => {
    expect(() =>
      assertCompleteScoreSet(indicators, [
        { indicatorId: 'i2' },
        { indicatorId: 'i1' },
      ]),
    ).not.toThrow();
  });

  it('terlewat, asing, atau ganda: 422 dengan rinciannya', () => {
    try {
      assertCompleteScoreSet(indicators, [
        { indicatorId: 'i1' },
        { indicatorId: 'i1' },
        { indicatorId: 'x9' },
      ]);
      throw new Error('harus 422');
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toEqual({
        message: KpiMessages.scoresMismatch,
        details: { missing: ['Kecepatan'], unknown: ['x9'], duplicate: ['i1'] },
      });
    }
  });

  it('finalisasi butuh semua skor terisi', () => {
    expect(() =>
      assertAllScored([{ score: d('80') }, { score: null }]),
    ).toThrow(
      new UnprocessableEntityException(KpiMessages.scoresIncomplete(1, 2)),
    );
    expect(() => assertAllScored([])).toThrow(UnprocessableEntityException);
    expect(() => assertAllScored([{ score: d('0') }])).not.toThrow();
  });
});
