import { Injectable, NotFoundException } from '@nestjs/common';
import { parseMoney } from '../../common/money/money.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { diffSnapshots } from '../audit/audit-sanitize.js';
import { AuditService } from '../audit/audit.service.js';
import type { UpdatePayrollItemDto } from './dto/payroll-request.dto.js';
import type { PayrollItemResponseDto } from './dto/payroll-response.dto.js';
import { payslipTotals } from './payroll-calculator.js';
import { lockPayrollPeriod } from './payroll-lock.js';
import { assertDraft, assertNetNotNegative } from './payroll-rules.js';
import { PayrollEntities, PayrollMessages } from './payroll.constants.js';
import {
  PAYROLL_ITEM_SELECT,
  payrollItemSnapshot,
  toPayrollItemDto,
} from './payroll.mapper.js';

/** Isian HR per slip (bonus, PPh 21, potongan lain, catatan). */
@Injectable()
export class PayrollItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Hanya saat periode DRAFT. Bruto dan take home pay dihitung ulang dari
   * komponen tersimpan; take home pay negatif ditolak 422. Berjalan di bawah
   * lock periode yang sama dengan run/finalize, jadi tidak bisa menyela
   * keduanya.
   */
  async update(
    id: string,
    dto: UpdatePayrollItemDto,
  ): Promise<PayrollItemResponseDto> {
    const located = await this.prisma.client.payrollItem.findUnique({
      where: { id },
      select: { periodId: true },
    });
    if (!located) {
      throw new NotFoundException(PayrollMessages.itemNotFound);
    }

    const row = await this.prisma.client.$transaction(async (tx) => {
      await lockPayrollPeriod(tx, located.periodId);
      const period = await tx.payrollPeriod.findUniqueOrThrow({
        where: { id: located.periodId },
        select: { period: true, status: true },
      });
      assertDraft(period.status);
      const current = await tx.payrollItem.findUniqueOrThrow({
        where: { id },
        select: PAYROLL_ITEM_SELECT,
      });

      const manual = {
        bonus: dto.bonus === undefined ? current.bonus : parseMoney(dto.bonus),
        pph21: dto.pph21 === undefined ? current.pph21 : parseMoney(dto.pph21),
        otherDeductions:
          dto.otherDeductions === undefined
            ? current.otherDeductions
            : parseMoney(dto.otherDeductions),
      };
      const { gross, net } = payslipTotals({
        baseSalary: current.baseSalary,
        fixedAllowance: current.fixedAllowance,
        bpjsKes: current.bpjsKes,
        bpjsJht: current.bpjsJht,
        bpjsJp: current.bpjsJp,
        ...manual,
      });
      assertNetNotNegative(net);
      const note = dto.note === undefined ? current.note : dto.note;

      const diff = diffSnapshots(
        payrollItemSnapshot(current),
        payrollItemSnapshot({ ...manual, note, gross, net }),
      );
      if (!diff) {
        return current;
      }
      const updated = await tx.payrollItem.update({
        where: { id },
        data: { ...manual, note, gross, net },
        select: PAYROLL_ITEM_SELECT,
      });
      await this.audit.recordChange(
        {
          entity: PayrollEntities.item,
          entityId: id,
          before: { period: period.period, ...diff.before },
          after: { period: period.period, ...diff.after },
        },
        tx,
      );
      return updated;
    });
    return toPayrollItemDto(row);
  }
}
