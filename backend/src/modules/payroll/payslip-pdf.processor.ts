import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { Clock } from '../../common/time/clock.js';
import type { Env } from '../../config/env.validation.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { SlipStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QueueNames } from '../../queue/queue.constants.js';
import { MailQueue } from '../mail/mail.queue.js';
import { StorageService } from '../storage/storage.service.js';
import {
  PayrollMessages,
  PDF_CONTENT_TYPE,
  payslipObjectKey,
} from './payroll.constants.js';
import { payslipReadyMail } from './payslip-mail.js';
import type { PayslipPdfJobData } from './payslip-pdf.queue.js';
import {
  buildPayslipPdfContent,
  renderPayslipPdf,
} from './payslip-pdf.renderer.js';
import {
  isFinalAttempt,
  isPublishedPeriod,
  toSlipError,
} from './payslip-pdf.rules.js';

/** Slip PDF yang dibuat bersamaan dalam satu proses worker. */
export const PAYSLIP_PDF_CONCURRENCY = 4;

const PDF_ITEM_SELECT = {
  id: true,
  employeeId: true,
  employeeName: true,
  nip: true,
  departmentName: true,
  positionName: true,
  bankName: true,
  bankAccountLast4: true,
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
  note: true,
  slipStatus: true,
  updatedAt: true,
  period: { select: { period: true, status: true } },
  employee: { select: { user: { select: { email: true } } } },
} as const satisfies Prisma.PayrollItemSelect;

type PdfItem = Prisma.PayrollItemGetPayload<{
  select: typeof PDF_ITEM_SELECT;
}>;

export type PayslipPdfJobResult =
  | { outcome: 'ready'; key: string; notified: boolean }
  | { outcome: 'skipped'; reason: 'item-missing' | 'not-queued' | 'changed' };

/**
 * Worker queue "payslip-pdf" (hanya berjalan di proses worker, src/worker.ts).
 *
 * 1. Baca snapshot PayrollItem. Slip yang sudah tidak QUEUED atau periodenya
 *    dibuka kembali (DRAFT) dilewati: job lama tidak pernah membuat PDF
 *    untuk data yang sudah berubah status.
 * 2. Render PDF (pdfkit), upload ke payslips/<period>/<employeeId>.pdf.
 * 3. QUEUED -> READY dengan syarat updatedAt belum berubah. Jika berubah
 *    (reopen/edit/regenerate di tengah render), periode DRAFT = hapus file;
 *    masih QUEUED = lempar error supaya dicoba lagi dengan data terbaru.
 * 4. Antre email "slip terbit" di queue "mail" (link ke aplikasi, tanpa
 *    lampiran). Gagal antre email tidak menggagalkan slip.
 *
 * Error dilempar ulang supaya BullMQ mencoba lagi (PAYSLIP_PDF_JOB_OPTIONS).
 * Di percobaan terakhir slip ditandai FAILED + slipError sebelum dilempar.
 */
@Processor(QueueNames.payslipPdf, { concurrency: PAYSLIP_PDF_CONCURRENCY })
export class PayslipPdfProcessor extends WorkerHost {
  private readonly logger = new Logger(PayslipPdfProcessor.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mailQueue: MailQueue,
    private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    super();
    this.appUrl = config.get('FRONTEND_URL', { infer: true });
  }

  async process(job: Job<PayslipPdfJobData>): Promise<PayslipPdfJobResult> {
    try {
      return await this.generate(job.data);
    } catch (error) {
      if (isFinalAttempt(job, error)) {
        await this.markFailed(job.data.itemId, error);
      }
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<PayslipPdfJobData> | undefined, error: Error): void {
    const attempts = job?.opts.attempts ?? 1;
    this.logger.warn(
      `PDF slip ${job?.data.itemId ?? '?'} gagal (percobaan ${job?.attemptsMade ?? '?'}/${attempts}): ${error.message}`,
    );
  }

  @OnWorkerEvent('error')
  onError(error: Error): void {
    this.logger.warn(`Worker payslip-pdf: ${error.message}`);
  }

  private async generate(
    data: PayslipPdfJobData,
  ): Promise<PayslipPdfJobResult> {
    const item = await this.prisma.client.payrollItem.findUnique({
      where: { id: data.itemId },
      select: PDF_ITEM_SELECT,
    });
    if (!item) {
      return { outcome: 'skipped', reason: 'item-missing' };
    }
    if (
      !isPublishedPeriod(item.period.status) ||
      item.slipStatus !== SlipStatus.QUEUED
    ) {
      return { outcome: 'skipped', reason: 'not-queued' };
    }

    const key = payslipObjectKey(item.period.period, item.employeeId);
    const pdf = await renderPayslipPdf(
      buildPayslipPdfContent(item, item.period.period, this.clock.now()),
    );
    await this.storage.putObject(key, pdf, PDF_CONTENT_TYPE);

    const { count } = await this.prisma.client.payrollItem.updateMany({
      where: {
        id: item.id,
        slipStatus: SlipStatus.QUEUED,
        updatedAt: item.updatedAt,
      },
      data: { slipStatus: SlipStatus.READY, slipKey: key, slipError: null },
    });
    if (count === 0) {
      return this.afterConcurrentChange(item.id, key);
    }

    const notified = data.notify ? await this.notify(item) : false;
    return { outcome: 'ready', key, notified };
  }

  /** Slip berubah selama PDF dibuat (lihat langkah 3 di atas). */
  private async afterConcurrentChange(
    itemId: string,
    key: string,
  ): Promise<PayslipPdfJobResult> {
    const current = await this.prisma.client.payrollItem.findUnique({
      where: { id: itemId },
      select: { slipStatus: true, period: { select: { status: true } } },
    });
    if (!current || !isPublishedPeriod(current.period.status)) {
      // Reopen sudah menghapus PDF; jangan tinggalkan file dari snapshot lama.
      await this.storage.delete(key);
      return { outcome: 'skipped', reason: 'changed' };
    }
    if (current.slipStatus === SlipStatus.QUEUED) {
      throw new Error(PayrollMessages.slipChangedDuringRender);
    }
    return { outcome: 'skipped', reason: 'changed' };
  }

  private async notify(item: PdfItem): Promise<boolean> {
    const to = item.employee.user.email;
    try {
      await this.mailQueue.enqueue(
        payslipReadyMail({
          to,
          name: item.employeeName,
          period: item.period.period,
          appUrl: this.appUrl,
        }),
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Email slip terbit untuk slip ${item.id} gagal diantrekan: ${toSlipError(error)}`,
      );
      return false;
    }
  }

  private async markFailed(itemId: string, error: unknown): Promise<void> {
    try {
      await this.prisma.client.payrollItem.updateMany({
        where: { id: itemId, slipStatus: SlipStatus.QUEUED },
        data: { slipStatus: SlipStatus.FAILED, slipError: toSlipError(error) },
      });
    } catch (updateError) {
      this.logger.error(
        `Status FAILED slip ${itemId} tidak tersimpan: ${toSlipError(updateError)}`,
      );
    }
  }
}
