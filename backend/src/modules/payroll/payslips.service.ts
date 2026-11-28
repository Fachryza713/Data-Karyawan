import { Injectable, NotFoundException } from '@nestjs/common';
import { formatMoney } from '../../common/money/money.js';
import { PayrollPeriodStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmployeeMessages } from '../employees/employees.constants.js';
import type {
  PayslipResponseDto,
  PayslipSummaryDto,
} from './dto/payroll-response.dto.js';
import { PayrollMessages } from './payroll.constants.js';
import { PAYROLL_ITEM_SELECT, toPayslipDto } from './payroll.mapper.js';

/** Slip terlihat karyawan hanya setelah FINAL (PRD US-13). */
const PUBLISHED = [PayrollPeriodStatus.FINAL, PayrollPeriodStatus.PAID];

const PERIOD_FIELDS = {
  id: true,
  period: true,
  status: true,
  finalizedAt: true,
  paidAt: true,
} as const;

/**
 * Slip gaji karyawan yang login. Karyawan selalu dari JWT; slip DRAFT dan
 * slip orang lain tidak pernah dikembalikan (404, keberadaannya tidak
 * dibocorkan). Angka dibaca dari snapshot PayrollItem, tidak dihitung ulang.
 */
@Injectable()
export class PayslipsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(userId: string): Promise<PayslipSummaryDto[]> {
    const employeeId = await this.employeeIdOf(userId);
    const items = await this.prisma.client.payrollItem.findMany({
      where: { employeeId, period: { status: { in: PUBLISHED } } },
      orderBy: { period: { period: 'desc' } },
      select: {
        gross: true,
        net: true,
        period: { select: PERIOD_FIELDS },
      },
    });
    return items.map((item) => ({
      periodId: item.period.id,
      period: item.period.period,
      status: item.period.status,
      gross: formatMoney(item.gross),
      net: formatMoney(item.net),
      paidAt: item.period.paidAt?.toISOString() ?? null,
    }));
  }

  async findMine(
    userId: string,
    periodId: string,
  ): Promise<PayslipResponseDto> {
    const employeeId = await this.employeeIdOf(userId);
    const item = await this.prisma.client.payrollItem.findFirst({
      where: {
        employeeId,
        periodId,
        period: { status: { in: PUBLISHED } },
      },
      select: { ...PAYROLL_ITEM_SELECT, period: { select: PERIOD_FIELDS } },
    });
    if (!item) {
      throw new NotFoundException(PayrollMessages.payslipNotFound);
    }
    return toPayslipDto(item, item.period);
  }

  private async employeeIdOf(userId: string): Promise<string> {
    const employee = await this.prisma.client.employee.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException(EmployeeMessages.noEmployeeRecord);
    }
    return employee.id;
  }
}
