import { ConflictException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../src/common/auth/auth-user.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { CompensationService } from '../../src/modules/payroll/compensation.service.js';
import { PayrollConfigService } from '../../src/modules/payroll/payroll-config.service.js';
import { PayrollItemsService } from '../../src/modules/payroll/payroll-items.service.js';
import { PayrollPeriodsService } from '../../src/modules/payroll/payroll-periods.service.js';
import { PayrollRunService } from '../../src/modules/payroll/payroll-run.service.js';
import { PayrollAuditActions as A } from '../../src/modules/payroll/payroll.constants.js';
import { PayslipsService } from '../../src/modules/payroll/payslips.service.js';
import { IntegrationFixtures } from './fixtures.js';

/**
 * Payroll di PostgreSQL asli: run idempoten (berurutan dan paralel),
 * snapshot slip setelah gaji naik, dan akses slip karyawan. Service dirakit
 * langsung dengan Prisma asli; hanya Clock yang diganti.
 */
describe('Payroll (integration, PostgreSQL asli)', () => {
  const fx = new IntegrationFixtures();
  // Kamis 26 Nov 2026 10:00 WIB: periode paling jauh 2026-12.
  const clock = { now: () => new Date('2026-11-26T03:00:00.000Z') };
  const PERIODS = ['2026-08', '2026-09', '2026-10'];

  let compensation: CompensationService;
  let runs: PayrollRunService;
  let periods: PayrollPeriodsService;
  let items: PayrollItemsService;
  let payslips: PayslipsService;
  let hr: AuthUser;
  let alice: { id: string; userId: string };
  let budi: { id: string; userId: string };
  let citra: { id: string; userId: string };

  const as = <T>(action: string, fn: () => Promise<T>) =>
    fx.asActor(hr.id, action, fn);

  const createPeriod = (period: string) =>
    as(A.periodCreate, () => periods.create({ period }));
  const run = (id: string) => as(A.periodRun, () => runs.run(id));
  const finalize = (id: string) =>
    as(A.periodFinalize, () => periods.finalize(id, hr));

  /** Slip milik karyawan uji di satu periode. */
  const ourItems = (periodId: string) =>
    fx.client.payrollItem.findMany({
      where: { periodId, employeeId: { in: fx.employeeIds } },
      orderBy: { nip: 'asc' },
    });

  async function addSalary(
    employeeId: string,
    baseSalary: string,
    effectiveFrom = '2024-01-01',
  ) {
    await as(A.salaryCreate, () =>
      compensation.createSalaryStructure(employeeId, {
        baseSalary,
        fixedAllowance: '1000000',
        bankName: 'BCA',
        bankAccountLast4: '1234',
        effectiveFrom,
      }),
    );
  }

  /** Hapus periode uji sisa run sebelumnya (database khusus test). */
  async function removePeriods() {
    const leftovers = await fx.client.payrollPeriod.findMany({
      where: { period: { in: PERIODS } },
      select: { id: true },
    });
    const ids = leftovers.map((row) => row.id);
    await fx.client.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await fx.client.payrollItem.deleteMany({
      where: { periodId: { in: ids } },
    });
    await fx.client.payrollPeriod.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    await removePeriods();
    const audit = new AuditService(fx.prisma);
    const configs = new PayrollConfigService(fx.prisma, audit, clock);
    compensation = new CompensationService(fx.prisma, audit, clock);
    runs = new PayrollRunService(fx.prisma, audit, configs);
    periods = new PayrollPeriodsService(fx.prisma, audit, clock);
    items = new PayrollItemsService(fx.prisma, audit);
    payslips = new PayslipsService(fx.prisma);

    await fx.createOrg();
    hr = { id: await fx.createUser('HR'), role: 'HR', employeeId: null };
    alice = await fx.createEmployee({ fullName: `Alice ${fx.run}` });
    budi = await fx.createEmployee({ fullName: `Budi ${fx.run}` });
    // Tanpa struktur gaji: dilewati payroll (skipped), tidak punya slip.
    citra = await fx.createEmployee({ fullName: `Citra ${fx.run}` });
    await addSalary(alice.id, '8000000');
    await addSalary(budi.id, '13500000');
  });

  afterAll(async () => {
    await removePeriods();
    await fx.cleanup();
  });

  it('run paralel lalu dua kali berurutan: jumlah slip dan total sama', async () => {
    const period = await createPeriod('2026-08');

    // Run pertama langsung paralel di periode kosong: lock membuat run kedua
    // menunggu, lalu melihat slip hasil run pertama (updated, bukan created).
    // Diulang beberapa putaran karena urutan eksekusi dua transaksi bervariasi.
    let parallel: Awaited<ReturnType<typeof run>>[] = [];
    for (let round = 0; round < 5; round++) {
      await fx.client.payrollItem.deleteMany({
        where: { periodId: period.id },
      });
      parallel = await Promise.all([run(period.id), run(period.id)]);
      const count = parallel[0].period.itemCount;
      expect(parallel.map((r) => r.created).sort((a, b) => a - b)).toEqual([
        0,
        count,
      ]);
    }
    const first = parallel[0];
    const itemCount = first.period.itemCount;
    expect(itemCount).toBeGreaterThanOrEqual(2);
    const sequential = [await run(period.id), await run(period.id)];

    for (const result of [...parallel, ...sequential]) {
      expect(result.totals).toEqual(first.totals);
      expect(result.period.itemCount).toBe(itemCount);
    }
    for (const result of sequential) {
      expect(result.created).toBe(0);
      expect(result.updated).toBe(itemCount);
    }
    expect(first.skipped.map((s) => s.employeeId)).toContain(citra.id);
    expect(
      await fx.client.payrollItem.count({ where: { periodId: period.id } }),
    ).toBe(itemCount);

    const rows = await ourItems(period.id);
    expect(rows.map((row) => row.employeeId).sort()).toEqual(
      [alice.id, budi.id].sort(),
    );
    const alicesSlip = rows.find((row) => row.employeeId === alice.id)!;
    // 8.000.000 + 1.000.000: BPJS 90.000 + 180.000 + 90.000 (lihat calculator spec).
    expect(alicesSlip.net.toFixed(2)).toBe('8640000.00');

    // Satu AuditLog per run (5 putaran x 2 + 2 berurutan).
    expect(
      await fx.client.auditLog.count({
        where: { action: A.periodRun, entityId: period.id },
      }),
    ).toBe(12);
  });

  it('isian HR (bonus, PPh 21, catatan) dipertahankan saat run ulang, termasuk paralel', async () => {
    const period = await createPeriod('2026-09');
    await run(period.id);
    const [aliceItem] = (await ourItems(period.id)).filter(
      (row) => row.employeeId === alice.id,
    );
    await as(A.itemUpdate, () =>
      items.update(aliceItem.id, {
        bonus: '1500000',
        pph21: '250000',
        note: 'Bonus target',
      }),
    );

    const [r1, r2] = await Promise.all([run(period.id), run(period.id)]);
    expect(r2.totals).toEqual(r1.totals);

    const after = await fx.client.payrollItem.findUniqueOrThrow({
      where: { id: aliceItem.id },
    });
    expect(after.bonus.toFixed(2)).toBe('1500000.00');
    expect(after.pph21.toFixed(2)).toBe('250000.00');
    expect(after.note).toBe('Bonus target');
    // 9.000.000 + 1.500.000 - 360.000 - 250.000
    expect(after.gross.toFixed(2)).toBe('10500000.00');
    expect(after.net.toFixed(2)).toBe('9890000.00');
    expect(
      await fx.client.payrollItem.count({
        where: { periodId: period.id, employeeId: alice.id },
      }),
    ).toBe(1);
  });

  it('snapshot: setelah finalize gaji pokok dinaikkan, slip periode lama tidak berubah', async () => {
    const period = await createPeriod('2026-10');
    await run(period.id);
    await finalize(period.id);
    const before = await payslips.findMine(alice.userId, period.id);
    expect(before.earnings.baseSalary).toBe('8000000.00');

    // Kenaikan gaji berlaku mundur sejak 1 Oktober (di dalam periode itu).
    await addSalary(alice.id, '9500000', '2026-10-01');

    const after = await payslips.findMine(alice.userId, period.id);
    expect(after).toEqual(before);
    const detail = await periods.findOne(period.id);
    expect(
      detail.items.find((item) => item.employeeId === alice.id)?.baseSalary,
    ).toBe('8000000.00');
    // Periode FINAL tidak bisa dijalankan ulang.
    await expect(run(period.id)).rejects.toBeInstanceOf(ConflictException);

    // Koreksi resmi: reopen (alasan dicatat) lalu run ulang memakai gaji baru.
    await as(A.periodReopen, () =>
      periods.reopen(period.id, 'Kenaikan gaji Oktober'),
    );
    await run(period.id);
    const [corrected] = (await ourItems(period.id)).filter(
      (row) => row.employeeId === alice.id,
    );
    expect(corrected.baseSalary.toFixed(2)).toBe('9500000.00');
    const reopenLog = await fx.client.auditLog.findFirstOrThrow({
      where: { action: A.periodReopen, entityId: period.id },
    });
    expect(reopenLog.before).toMatchObject({ status: 'FINAL' });
    expect(reopenLog.after).toMatchObject({
      status: 'DRAFT',
      reason: 'Kenaikan gaji Oktober',
    });

    // PAID tidak bisa dibuka lagi.
    await finalize(period.id);
    await as(A.periodMarkPaid, () => periods.markPaid(period.id));
    await expect(
      as(A.periodReopen, () => periods.reopen(period.id, 'Coba')),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('karyawan tidak bisa membaca slip periode DRAFT atau slip milik orang lain', async () => {
    const draft = await fx.client.payrollPeriod.findUniqueOrThrow({
      where: { period: '2026-09' },
    });
    expect(draft.status).toBe('DRAFT');
    // DRAFT: slip Alice ada di database, tapi belum terbit.
    expect(
      await fx.client.payrollItem.count({
        where: { periodId: draft.id, employeeId: alice.id },
      }),
    ).toBe(1);
    await expect(
      payslips.findMine(alice.userId, draft.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    const published = await fx.client.payrollPeriod.findUniqueOrThrow({
      where: { period: '2026-10' },
    });
    // Citra tidak punya slip di periode itu; slip Alice/Budi tidak terlihat.
    await expect(
      payslips.findMine(citra.userId, published.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    const alicesList = await payslips.listMine(alice.userId);
    expect(alicesList.map((slip) => slip.period)).toEqual(['2026-10']);
    expect(await payslips.listMine(citra.userId)).toEqual([]);
    const budisSlip = await payslips.findMine(budi.userId, published.id);
    expect(budisSlip.employee.fullName).toBe(`Budi ${fx.run}`);
  });
});
