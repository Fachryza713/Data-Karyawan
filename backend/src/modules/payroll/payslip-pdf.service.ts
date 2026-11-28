import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SlipStatus } from '../../generated/prisma/enums.js';
import {
  type AppTransactionClient,
  PrismaService,
} from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { StorageService } from '../storage/storage.service.js';
import type {
  PayslipGenerationStatusDto,
  RegeneratePayslipsResponseDto,
} from './dto/payslip-pdf.dto.js';
import { lockPayrollPeriod } from './payroll-lock.js';
import {
  PayrollEntities,
  PayrollMessages,
  payslipObjectKey,
  RegenerateScope,
} from './payroll.constants.js';
import {
  type PayslipPdfJobData,
  PayslipPdfQueue,
} from './payslip-pdf.queue.js';
import {
  assertSlipsPublished,
  shouldNotifyOnRegenerate,
  toSlipError,
} from './payslip-pdf.rules.js';

/**
 * Siklus PDF slip di sisi API: tandai QUEUED dan masukkan job saat
 * finalize, kembalikan ke NONE dan hapus file saat reopen, buat ulang, dan
 * rekap status. PDF-nya dibuat PayslipPdfProcessor di proses worker.
 */
@Injectable()
export class PayslipPdfService {
  private readonly logger = new Logger(PayslipPdfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queue: PayslipPdfQueue,
    private readonly storage: StorageService,
  ) {}

  /** Di transaksi finalize: semua slip periode menjadi QUEUED. */
  async markQueued(tx: AppTransactionClient, periodId: string): Promise<void> {
    await tx.payrollItem.updateMany({
      where: { periodId },
      data: { slipStatus: SlipStatus.QUEUED, slipKey: null, slipError: null },
    });
  }

  /**
   * Setelah commit: masukkan job. Tidak pernah melempar, supaya finalize
   * tetap selesai walau Redis mati; slip yang gagal masuk antrean ditandai
   * FAILED (terlihat di status, bisa dibuat ulang). Return false jika gagal.
   */
  async enqueue(jobs: PayslipPdfJobData[]): Promise<boolean> {
    try {
      await this.queue.enqueue(jobs);
      return true;
    } catch (error) {
      this.logger.error(
        `${jobs.length} slip gagal masuk antrean PDF: ${toSlipError(error)}`,
      );
      await this.markEnqueueFailed(
        jobs.map((job) => job.itemId),
        error,
      );
      return false;
    }
  }

  /**
   * Di transaksi reopen: slip kembali NONE. Return key PDF yang harus
   * dihapus: key tersimpan dan key baku tiap karyawan (PDF yang baru
   * di-upload worker tapi belum sempat dicatat).
   */
  async resetForReopen(
    tx: AppTransactionClient,
    periodId: string,
    period: string,
  ): Promise<string[]> {
    const items = await tx.payrollItem.findMany({
      where: { periodId },
      select: { employeeId: true, slipKey: true },
    });
    await tx.payrollItem.updateMany({
      where: { periodId },
      data: { slipStatus: SlipStatus.NONE, slipKey: null, slipError: null },
    });
    const keys = new Set<string>();
    for (const item of items) {
      keys.add(payslipObjectKey(period, item.employeeId));
      if (item.slipKey) {
        keys.add(item.slipKey);
      }
    }
    return [...keys];
  }

  /**
   * Setelah commit reopen: hapus PDF lama. Gagal hapus hanya dicatat; file
   * yang tertinggal tidak bisa dibuka (slipKey sudah null) dan ditimpa saat
   * finalize berikutnya.
   */
  async deleteFiles(keys: string[]): Promise<void> {
    const results = await Promise.allSettled(
      keys.map((key) => this.storage.delete(key)),
    );
    const failed = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failed.length > 0) {
      this.logger.warn(
        `${failed.length} dari ${keys.length} PDF slip lama gagal dihapus: ${toSlipError(
          failed[0].reason,
        )}`,
      );
    }
  }

  /**
   * Buat ulang PDF slip FAILED (default) atau semua slip periode FINAL/PAID.
   * Status QUEUED ditulis di bawah lock periode (tidak bentrok dengan
   * reopen), job dimasukkan setelah commit. 503 jika antrean tidak tersedia.
   */
  async regenerate(
    periodId: string,
    scope: RegenerateScope,
  ): Promise<RegeneratePayslipsResponseDto> {
    const jobs = await this.prisma.client.$transaction(async (tx) => {
      await lockPayrollPeriod(tx, periodId);
      const period = await tx.payrollPeriod.findUnique({
        where: { id: periodId },
        select: { period: true, status: true },
      });
      if (!period) {
        throw new NotFoundException(PayrollMessages.periodNotFound);
      }
      assertSlipsPublished(period.status);
      const items = await tx.payrollItem.findMany({
        where: {
          periodId,
          ...(scope === RegenerateScope.FAILED
            ? { slipStatus: SlipStatus.FAILED }
            : {}),
        },
        select: { id: true, slipStatus: true },
      });
      if (items.length > 0) {
        await tx.payrollItem.updateMany({
          where: { id: { in: items.map((item) => item.id) } },
          data: { slipStatus: SlipStatus.QUEUED, slipError: null },
        });
      }
      await this.audit.recordChange(
        {
          entity: PayrollEntities.period,
          entityId: periodId,
          after: { period: period.period, scope, queued: items.length },
        },
        tx,
      );
      return items.map((item) => ({
        itemId: item.id,
        notify: shouldNotifyOnRegenerate(item.slipStatus),
      }));
    });

    if (!(await this.enqueue(jobs))) {
      throw new ServiceUnavailableException(
        PayrollMessages.slipQueueUnavailable,
      );
    }
    return { periodId, scope, queued: jobs.length };
  }

  /** Jumlah slip per SlipStatus dan daftar slip FAILED beserta alasannya. */
  async status(periodId: string): Promise<PayslipGenerationStatusDto> {
    const period = await this.prisma.client.payrollPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, period: true, status: true },
    });
    if (!period) {
      throw new NotFoundException(PayrollMessages.periodNotFound);
    }
    const [groups, failed] = await Promise.all([
      this.prisma.client.payrollItem.groupBy({
        by: ['slipStatus'],
        where: { periodId },
        _count: { _all: true },
      }),
      this.prisma.client.payrollItem.findMany({
        where: { periodId, slipStatus: SlipStatus.FAILED },
        orderBy: { nip: 'asc' },
        select: {
          id: true,
          employeeId: true,
          nip: true,
          employeeName: true,
          slipError: true,
        },
      }),
    ]);
    const counts = { NONE: 0, QUEUED: 0, READY: 0, FAILED: 0 };
    for (const group of groups) {
      counts[group.slipStatus] = group._count._all;
    }
    return {
      periodId: period.id,
      period: period.period,
      status: period.status,
      total: counts.NONE + counts.QUEUED + counts.READY + counts.FAILED,
      counts,
      failed: failed.map((item) => ({
        itemId: item.id,
        employeeId: item.employeeId,
        nip: item.nip,
        employeeName: item.employeeName,
        error: item.slipError,
      })),
    };
  }

  private async markEnqueueFailed(
    itemIds: string[],
    error: unknown,
  ): Promise<void> {
    try {
      await this.prisma.client.payrollItem.updateMany({
        where: { id: { in: itemIds }, slipStatus: SlipStatus.QUEUED },
        data: {
          slipStatus: SlipStatus.FAILED,
          slipError: toSlipError(error, PayrollMessages.slipEnqueueFailed),
        },
      });
    } catch (updateError) {
      this.logger.error(
        `Status FAILED untuk slip yang gagal masuk antrean tidak tersimpan: ${toSlipError(updateError)}`,
      );
    }
  }
}
