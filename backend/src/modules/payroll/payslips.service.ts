import { Injectable, NotFoundException } from '@nestjs/common';
import { formatMoney } from '../../common/money/money.js';
import { Clock } from '../../common/time/clock.js';
import { SlipStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmployeeMessages } from '../employees/employees.constants.js';
import { StorageService } from '../storage/storage.service.js';
import type {
  PayslipResponseDto,
  PayslipSummaryDto,
} from './dto/payroll-response.dto.js';
import type {
  PayslipPdfPendingDto,
  PayslipPdfUrlDto,
} from './dto/payslip-pdf.dto.js';
import {
  PAYSLIP_PDF_URL_TTL_SECONDS,
  PayrollMessages,
  payslipFileName,
} from './payroll.constants.js';
import { PAYROLL_ITEM_SELECT, toPayslipDto } from './payroll.mapper.js';
import {
  PUBLISHED_PERIOD_STATUSES,
  payslipPdfAvailability,
} from './payslip-pdf.rules.js';

/** Slip terlihat karyawan hanya setelah FINAL (PRD US-13). */
const PUBLISHED = [...PUBLISHED_PERIOD_STATUSES];

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly clock: Clock,
  ) {}

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

  /**
   * PDF slip saya: READY = presigned URL 5 menit, QUEUED = masih dibuat
   * worker (controller membalas 202). FAILED/NONE = 409 (payslipPdfAvailability).
   * Slip DRAFT atau milik orang lain = 404, sama seperti findMine.
   */
  async myPdf(
    userId: string,
    periodId: string,
  ): Promise<PayslipPdfUrlDto | PayslipPdfPendingDto> {
    const employeeId = await this.employeeIdOf(userId);
    const item = await this.prisma.client.payrollItem.findFirst({
      where: { employeeId, periodId, period: { status: { in: PUBLISHED } } },
      select: {
        nip: true,
        slipStatus: true,
        slipKey: true,
        period: { select: { period: true } },
      },
    });
    if (!item) {
      throw new NotFoundException(PayrollMessages.payslipNotFound);
    }
    const availability = payslipPdfAvailability(item.slipStatus, item.slipKey);
    if (availability.status === SlipStatus.QUEUED) {
      return {
        status: SlipStatus.QUEUED,
        message: PayrollMessages.slipPdfQueued,
      };
    }
    const expiresAt = new Date(
      this.clock.now().getTime() + PAYSLIP_PDF_URL_TTL_SECONDS * 1000,
    );
    const url = await this.storage.createPresignedDownload(
      availability.key,
      PAYSLIP_PDF_URL_TTL_SECONDS,
      payslipFileName(item.period.period, item.nip),
    );
    return {
      status: SlipStatus.READY,
      url,
      expiresAt: expiresAt.toISOString(),
    };
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
