import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { zeroMoney } from '../../common/money/money.js';
import { parseDateOnly } from '../../common/validation/date-only.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  type AppTransactionClient,
  PrismaService,
} from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  PayrollRunResponseDto,
  SkippedEmployeeDto,
} from './dto/payroll-response.dto.js';
import {
  calculatePayslip,
  type ManualInput,
  type PayrollRates,
} from './payroll-calculator.js';
import { PayrollConfigService } from './payroll-config.service.js';
import { lockPayrollPeriod } from './payroll-lock.js';
import { assertDraft, periodBounds } from './payroll-rules.js';
import {
  sumItems,
  toConfigSnapshotJson,
  toEmployerContributionsJson,
  toTotalsJson,
} from './payroll-totals.js';
import {
  PayrollEntities,
  PayrollMessages,
  RUN_TRANSACTION_TIMEOUT_MS,
} from './payroll.constants.js';
import { PAYROLL_PERIOD_SELECT, toPayrollPeriodDto } from './payroll.mapper.js';

/** Karyawan yang dihitung beserta struktur gaji yang berlaku di periode. */
const ELIGIBLE_EMPLOYEE_SELECT = (periodEnd: Date) =>
  ({
    id: true,
    nip: true,
    fullName: true,
    department: { select: { name: true } },
    position: { select: { name: true } },
    salaries: {
      where: { effectiveFrom: { lte: periodEnd } },
      orderBy: [
        { effectiveFrom: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: 1,
      select: {
        baseSalary: true,
        fixedAllowance: true,
        bankName: true,
        bankAccountLast4: true,
      },
    },
  }) as const satisfies Prisma.EmployeeSelect;

type EligibleEmployee = Prisma.EmployeeGetPayload<{
  select: ReturnType<typeof ELIGIBLE_EMPLOYEE_SELECT>;
}>;

const TOTALS_SELECT = {
  baseSalary: true,
  fixedAllowance: true,
  bonus: true,
  gross: true,
  bpjsKes: true,
  bpjsJht: true,
  bpjsJp: true,
  pph21: true,
  otherDeductions: true,
  net: true,
  employerContributions: true,
} as const satisfies Prisma.PayrollItemSelect;

const NO_MANUAL_INPUT = (): ManualInput => ({
  bonus: zeroMoney(),
  pph21: zeroMoney(),
  otherDeductions: zeroMoney(),
});

/**
 * Menjalankan payroll satu periode DRAFT. IDEMPOTENT: dijalankan berapa kali
 * pun (termasuk bersamaan) hasilnya satu slip per karyawan dengan angka yang
 * sama, karena
 * - satu transaksi dengan pg_advisory_xact_lock per periode (run kedua
 *   menunggu run pertama commit, lalu membaca hasilnya);
 * - slip di-upsert per (periodId, employeeId), dijaga unique constraint;
 * - bonus, PPh 21, potongan lain, dan catatan isian HR tidak ditimpa.
 */
@Injectable()
export class PayrollRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly configs: PayrollConfigService,
  ) {}

  async run(periodId: string): Promise<PayrollRunResponseDto> {
    const result = await this.prisma.client.$transaction(
      (tx) => this.runLocked(tx, periodId),
      { timeout: RUN_TRANSACTION_TIMEOUT_MS },
    );
    const period = await this.prisma.client.payrollPeriod.findUniqueOrThrow({
      where: { id: periodId },
      select: PAYROLL_PERIOD_SELECT,
    });
    return {
      ...result,
      period: toPayrollPeriodDto(period, {
        itemCount: result.totals.itemCount,
        totalNet: result.totalNet,
      }),
      totals: toTotalsJson(result.totals),
    };
  }

  private async runLocked(tx: AppTransactionClient, periodId: string) {
    await lockPayrollPeriod(tx, periodId);
    // Dibaca setelah lock: status dari run/finalize sebelumnya sudah terlihat.
    const period = await tx.payrollPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, period: true, status: true },
    });
    if (!period) {
      throw new NotFoundException(PayrollMessages.periodNotFound);
    }
    assertDraft(period.status);

    const bounds = periodBounds(period.period);
    // Tarif awal bulan, struktur gaji yang berlaku sampai akhir bulan.
    const { rates, rows } = await this.configs.ratesOn(bounds.start, tx);
    const configSnapshot = toConfigSnapshotJson(rows);
    const periodEnd = parseDateOnly(bounds.end);

    const employees = await tx.employee.findMany({
      where: { user: { isActive: true }, joinDate: { lte: periodEnd } },
      orderBy: { nip: 'asc' },
      select: ELIGIBLE_EMPLOYEE_SELECT(periodEnd),
    });
    const eligible = employees.filter((employee) => employee.salaries.length);
    const skipped: SkippedEmployeeDto[] = employees
      .filter((employee) => employee.salaries.length === 0)
      .map((employee) => ({
        employeeId: employee.id,
        nip: employee.nip,
        fullName: employee.fullName,
      }));
    if (eligible.length === 0) {
      throw new UnprocessableEntityException({
        message: PayrollMessages.noEligibleEmployees,
        details: { skipped },
      });
    }

    // Slip yang sudah ada: total sebelum run (audit) dan isian HR yang
    // dipertahankan (bonus, PPh 21, potongan lain).
    const existing = await tx.payrollItem.findMany({
      where: { periodId },
      select: { ...TOTALS_SELECT, employeeId: true },
    });
    const manualByEmployee = new Map<string, ManualInput>(
      existing.map((item) => [
        item.employeeId,
        {
          bonus: item.bonus,
          pph21: item.pph21,
          otherDeductions: item.otherDeductions,
        },
      ]),
    );
    const before = sumItems(existing);

    for (const employee of eligible) {
      await this.upsertItem(
        tx,
        periodId,
        employee,
        manualByEmployee.get(employee.id) ?? NO_MANUAL_INPUT(),
        rates,
        configSnapshot,
      );
    }
    // Karyawan yang tidak lagi memenuhi syarat (nonaktif, gaji dihapus dari
    // periode) dikeluarkan dari draft supaya total tidak ganda atau basi.
    const { count: removed } = await tx.payrollItem.deleteMany({
      where: {
        periodId,
        employeeId: { notIn: eligible.map((employee) => employee.id) },
      },
    });

    const totals = sumItems(
      await tx.payrollItem.findMany({
        where: { periodId },
        select: TOTALS_SELECT,
      }),
    );
    const created = eligible.filter((e) => !manualByEmployee.has(e.id)).length;
    const updated = eligible.length - created;
    await this.audit.recordChange(
      {
        entity: PayrollEntities.period,
        entityId: periodId,
        before: { period: period.period, totals: toTotalsJson(before) },
        after: {
          period: period.period,
          created,
          updated,
          removed,
          skipped: skipped.length,
          totals: toTotalsJson(totals),
          configSnapshot,
        },
      },
      tx,
    );
    return {
      created,
      updated,
      removed,
      skipped,
      totals,
      totalNet: totals.net,
    };
  }

  /**
   * Satu slip per karyawan. Saat update, bonus/pph21/otherDeductions/note
   * tidak ikut ditulis; bruto dan take home pay dihitung dengan nilai isian
   * HR yang sudah ada (dibaca di bawah lock yang sama).
   */
  private async upsertItem(
    tx: AppTransactionClient,
    periodId: string,
    employee: EligibleEmployee,
    manual: ManualInput,
    rates: PayrollRates,
    configSnapshot: Prisma.InputJsonValue,
  ): Promise<void> {
    const [salary] = employee.salaries;
    const amounts = calculatePayslip(salary, manual, rates);
    const computed = {
      employeeName: employee.fullName,
      nip: employee.nip,
      departmentName: employee.department.name,
      positionName: employee.position.name,
      bankName: salary.bankName,
      bankAccountLast4: salary.bankAccountLast4,
      baseSalary: amounts.baseSalary,
      fixedAllowance: amounts.fixedAllowance,
      gross: amounts.gross,
      bpjsKes: amounts.bpjsKes,
      bpjsJht: amounts.bpjsJht,
      bpjsJp: amounts.bpjsJp,
      net: amounts.net,
      employerContributions: toEmployerContributionsJson(
        amounts.employerContributions,
      ),
      configSnapshot,
    };
    await tx.payrollItem.upsert({
      where: { periodId_employeeId: { periodId, employeeId: employee.id } },
      create: {
        periodId,
        employeeId: employee.id,
        ...computed,
        bonus: manual.bonus,
        pph21: manual.pph21,
        otherDeductions: manual.otherDeductions,
      },
      update: computed,
    });
  }
}
