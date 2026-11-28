import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthUser } from '../../src/common/auth/auth-user.js';
import { Prisma } from '../../src/generated/prisma/client.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { KpiPeriodsService } from '../../src/modules/kpi/kpi-periods.service.js';
import { KpiReviewsService } from '../../src/modules/kpi/kpi-reviews.service.js';
import { KpiTemplatesService } from '../../src/modules/kpi/kpi-templates.service.js';
import { KpiAuditActions as A } from '../../src/modules/kpi/kpi.constants.js';
import { IntegrationFixtures } from './fixtures.js';

/**
 * KPI di PostgreSQL asli: aktivasi ditolak tanpa template valid, aktivasi
 * membuat review + snapshot dalam satu transaksi, snapshot tidak berubah
 * saat template diedit, finalisasi mengunci skor, dan index unik parsial
 * (satu periode ACTIVE, satu template aktif per jabatan).
 */
describe('KPI (integration, PostgreSQL asli)', () => {
  const fx = new IntegrationFixtures();
  const clock = { now: () => new Date('2026-04-14T03:00:00.000Z') };

  let templates: KpiTemplatesService;
  let periods: KpiPeriodsService;
  let reviews: KpiReviewsService;
  let hr: AuthUser;
  let positionId: string;
  let otherPositionId: string;
  let alice: { id: string; userId: string };
  let budi: { id: string; userId: string };
  const periodIds: string[] = [];
  const templateIds: string[] = [];

  const as = <T>(action: string, fn: () => Promise<T>) =>
    fx.asActor(hr.id, action, fn);

  async function createPeriod(name: string) {
    const period = await as(A.periodCreate, () =>
      periods.create({
        name,
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        deadline: '2026-04-15',
      }),
    );
    periodIds.push(period.id);
    return period;
  }

  /**
   * Jabatan lain yang punya karyawan aktif di database test (data uji lain)
   * diberi template valid supaya aktivasi hanya bergantung pada jabatan uji.
   */
  async function coverOtherPositions() {
    const employees = await fx.client.employee.findMany({
      where: {
        user: { isActive: true },
        positionId: { notIn: [positionId] },
        position: { kpiTemplates: { none: { isActive: true } } },
      },
      select: { positionId: true },
      distinct: ['positionId'],
    });
    for (const { positionId: id } of employees) {
      const created = await fx.client.kpiTemplate.create({
        data: {
          positionId: id,
          name: `Integration ${fx.run}`,
          indicators: {
            create: [{ name: 'Umum', weight: new Prisma.Decimal(100) }],
          },
        },
      });
      templateIds.push(created.id);
    }
  }

  beforeAll(async () => {
    const audit = new AuditService(fx.prisma);
    templates = new KpiTemplatesService(fx.prisma, audit);
    periods = new KpiPeriodsService(fx.prisma, audit, clock);
    reviews = new KpiReviewsService(fx.prisma, audit, clock);

    await fx.createOrg();
    hr = { id: await fx.createUser('HR'), role: 'HR', employeeId: null };
    alice = await fx.createEmployee({ fullName: `Alice ${fx.run}` });
    budi = await fx.createEmployee({ fullName: `Budi ${fx.run}` });
    const employee = await fx.client.employee.findUniqueOrThrow({
      where: { id: alice.id },
      select: { positionId: true, departmentId: true },
    });
    positionId = employee.positionId;
    otherPositionId = (
      await fx.client.position.create({
        data: {
          name: `Reviewer ${fx.run}`,
          departmentId: employee.departmentId,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await fx.cleanup(async (client) => {
      await client.auditLog.deleteMany({
        where: { entityId: { in: [...periodIds, ...templateIds] } },
      });
      await client.kpiReview.deleteMany({
        where: { periodId: { in: periodIds } },
      });
      await client.kpiPeriod.deleteMany({ where: { id: { in: periodIds } } });
      await client.kpiTemplate.deleteMany({
        where: {
          OR: [
            { id: { in: templateIds } },
            { positionId: { in: [positionId, otherPositionId] } },
          ],
        },
      });
      await client.position.delete({ where: { id: otherPositionId } });
    });
  });

  it('aktivasi ditolak 422 + daftar jabatan selama template belum valid; tidak ada review dibuat', async () => {
    await coverOtherPositions();
    const period = await createPeriod(`Q1 2026 ${fx.run}`);

    const noTemplate = await as(A.periodActivate, () =>
      periods.activate(period.id),
    ).catch((e: unknown) => e);
    expect(noTemplate).toBeInstanceOf(UnprocessableEntityException);
    expect(
      (noTemplate as UnprocessableEntityException).getResponse(),
    ).toMatchObject({
      details: {
        positions: [
          {
            positionId,
            activeEmployees: 2,
            problem: 'Belum ada template aktif',
          },
        ],
      },
    });

    // 33,33 x 3 = 99,99: masih belum valid.
    const template = await as(A.templateCreate, () =>
      templates.create({
        positionId,
        name: `KPI Tester ${fx.run}`,
        indicators: [
          { name: 'Kualitas', weight: '33.33' },
          { name: 'Kecepatan', weight: '33.33' },
          { name: 'Kolaborasi', weight: '33.33' },
        ],
      }),
    );
    templateIds.push(template.id);
    expect(template).toMatchObject({ isValid: false, totalWeight: '99.99' });
    await expect(
      as(A.periodActivate, () => periods.activate(period.id)),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    const after = await fx.client.kpiPeriod.findUniqueOrThrow({
      where: { id: period.id },
    });
    expect(after.status).toBe('DRAFT');
    expect(
      await fx.client.kpiReview.count({ where: { periodId: period.id } }),
    ).toBe(0);
  });

  it('aktivasi: review DRAFT + snapshot per karyawan aktif dalam satu transaksi; hanya satu periode ACTIVE', async () => {
    const [period] = await fx.client.kpiPeriod.findMany({
      where: { id: { in: periodIds } },
    });
    const template = (await templates.list({ positionId, isActive: true }))[0];
    const kolaborasi = template.indicators.find(
      (i) => i.name === 'Kolaborasi',
    )!;
    // 33,33 + 33,33 + 33,34 = 100: valid.
    await as(A.indicatorUpdate, () =>
      templates.updateIndicator(template.id, kolaborasi.id, {
        weight: '33.34',
      }),
    );

    const result = await as(A.periodActivate, () =>
      periods.activate(period.id),
    );

    expect(result.period.status).toBe('ACTIVE');
    const ours = await fx.client.kpiReview.findMany({
      where: { periodId: period.id, employeeId: { in: [alice.id, budi.id] } },
      include: { scores: { orderBy: { order: 'asc' } } },
    });
    expect(ours).toHaveLength(2);
    for (const review of ours) {
      expect(review).toMatchObject({
        status: 'DRAFT',
        positionId,
        templateId: template.id,
      });
      expect(
        review.scores.map((s) => [s.name, s.weight.toFixed(2), s.score]),
      ).toEqual([
        ['Kualitas', '33.33', null],
        ['Kecepatan', '33.33', null],
        ['Kolaborasi', '33.34', null],
      ]);
    }
    expect(result.reviewsCreated).toBe(
      await fx.client.kpiReview.count({ where: { periodId: period.id } }),
    );

    // Periode kedua tidak bisa aktif bersamaan (cek service + index unik parsial).
    const second = await createPeriod(`Q2 2026 ${fx.run}`);
    await expect(
      as(A.periodActivate, () => periods.activate(second.id)),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      fx.client.kpiPeriod.update({
        where: { id: second.id },
        data: { status: 'ACTIVE', activatedAt: new Date() },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('mengubah template setelah aktivasi tidak mengubah penilaian; template aktif unik per jabatan', async () => {
    const template = (await templates.list({ positionId, isActive: true }))[0];
    const [first, second] = template.indicators;
    await as(A.indicatorUpdate, () =>
      templates.updateIndicator(template.id, first.id, {
        weight: '50',
        name: 'Kualitas kode',
      }),
    );
    await as(A.indicatorDelete, () =>
      templates.removeIndicator(template.id, second.id),
    );

    const review = await fx.client.kpiReview.findFirstOrThrow({
      where: { employeeId: alice.id, periodId: { in: periodIds } },
      include: { scores: { orderBy: { order: 'asc' } } },
    });
    expect(review.scores.map((s) => [s.name, s.weight.toFixed(2)])).toEqual([
      ['Kualitas', '33.33'],
      ['Kecepatan', '33.33'],
      ['Kolaborasi', '33.34'],
    ]);

    // Salin ke jabatan lain: template aktif baru dengan indikator yang sama.
    const copy = await as(A.templateCopy, () =>
      templates.copy({
        fromPositionId: positionId,
        toPositionId: otherPositionId,
      }),
    );
    templateIds.push(copy.id);
    expect(copy.indicators.map((i) => [i.name, i.weight])).toEqual([
      ['Kualitas kode', '50.00'],
      ['Kolaborasi', '33.34'],
    ]);
    // Index unik parsial: dua template aktif di satu jabatan ditolak database.
    await expect(
      fx.client.kpiTemplate.create({
        data: { positionId: otherPositionId, name: 'Ganda', isActive: true },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('skor + finalisasi: 90/80/70 dengan bobot 33,33/33,33/33,34 = 80,0 (B), lalu terkunci', async () => {
    const review = await fx.client.kpiReview.findFirstOrThrow({
      where: { employeeId: alice.id, periodId: { in: periodIds } },
      include: { scores: { orderBy: { order: 'asc' } } },
    });
    const [k1, k2, k3] = review.scores.map((s) => s.indicatorId);

    // HR tidak boleh menilai dirinya sendiri: review milik akun lain di sini.
    const saved = await reviews.saveScores(
      review.id,
      {
        scores: [
          { indicatorId: k1, score: '90' },
          { indicatorId: k2, score: '80', note: 'Cukup' },
          { indicatorId: k3, score: '70' },
        ],
        note: 'Catatan HR',
      },
      hr,
    );
    expect(saved.preview).toEqual({ finalScore: '80.0', grade: 'B' });

    const final = await as(A.reviewFinalize, () =>
      reviews.finalize(review.id, hr),
    );
    expect(final).toMatchObject({
      status: 'FINAL',
      finalScore: '80.0',
      grade: 'B',
      reviewer: { id: hr.id },
      note: 'Catatan HR',
    });
    await expect(
      reviews.saveScores(
        review.id,
        { scores: [{ indicatorId: k1, score: '100' }] },
        hr,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      as(A.reviewFinalize, () => reviews.finalize(review.id, hr)),
    ).rejects.toBeInstanceOf(ConflictException);
    const log = await fx.client.auditLog.findFirstOrThrow({
      where: { action: A.reviewFinalize, entityId: review.id },
    });
    expect(log.after).toMatchObject({ finalScore: '80.0', grade: 'B' });

    const progress = await periods.progress(review.periodId);
    expect(progress.finalized).toBeGreaterThanOrEqual(1);
    expect(progress.total).toBe(progress.finalized + progress.remaining);
  });

  it('karyawan HR yang dinilai tidak bisa mengisi skornya sendiri (403); periode ditutup mengunci DRAFT', async () => {
    const review = await fx.client.kpiReview.findFirstOrThrow({
      where: { employeeId: budi.id, periodId: { in: periodIds } },
      include: { scores: true },
    });
    const self: AuthUser = { id: budi.userId, role: 'HR', employeeId: budi.id };
    const body = {
      scores: review.scores.map((s) => ({
        indicatorId: s.indicatorId,
        score: '100',
      })),
    };
    await expect(
      reviews.saveScores(review.id, body, self),
    ).rejects.toMatchObject({
      status: 403,
    });

    await as(A.periodClose, () => periods.close(review.periodId));
    await expect(
      reviews.saveScores(review.id, body, hr),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
