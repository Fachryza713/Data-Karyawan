import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { JobsOptions, JobState, Queue } from 'bullmq';
import { QueueNames } from '../../queue/queue.constants.js';

export const PAYSLIP_PDF_JOB = 'generate';

/** Satu job = satu slip (PayrollItem). */
export type PayslipPdfJobData = {
  itemId: string;
  /** Kirim email "slip terbit" setelah READY. */
  notify: boolean;
};

/** Percobaan ulang setelah percobaan pertama gagal. */
export const PAYSLIP_PDF_RETRIES = 3;

/**
 * Percobaan pertama + 3 retry dengan backoff eksponensial 5 s, 10 s, 20 s.
 * Job selesai disimpan 1 hari dan job gagal 7 hari supaya terlihat di
 * Bull Board; enqueue() menghapusnya dulu sebelum membuat ulang.
 */
export const PAYSLIP_PDF_JOB_OPTIONS = {
  attempts: 1 + PAYSLIP_PDF_RETRIES,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
} as const satisfies JobsOptions;

/** Redis tidak merespons selama ini: enqueue dianggap gagal. */
export const ENQUEUE_TIMEOUT_MS = 5_000;

const FINISHED: ReadonlySet<JobState | 'unknown'> = new Set([
  'completed',
  'failed',
]);

/** Bagian Queue BullMQ yang dipakai (mudah diganti di test). */
export type PayslipQueueClient = Pick<Queue, 'getJob' | 'addBulk'>;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Redis tidak merespons dalam ${ms} ms`)),
      ms,
    );
    timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Producer queue "payslip-pdf". jobId = itemId: selama job sebuah slip
 * masih menunggu atau berjalan, BullMQ mengabaikan add dengan id yang sama,
 * jadi finalize/regenerate yang terpanggil dua kali tidak membuat job ganda.
 */
@Injectable()
export class PayslipPdfQueue {
  constructor(
    @InjectQueue(QueueNames.payslipPdf)
    private readonly queue: PayslipQueueClient,
  ) {}

  async enqueue(jobs: readonly PayslipPdfJobData[]): Promise<void> {
    if (jobs.length === 0) {
      return;
    }
    await withTimeout(this.add(jobs), ENQUEUE_TIMEOUT_MS);
  }

  private async add(jobs: readonly PayslipPdfJobData[]): Promise<void> {
    // Job lama yang sudah selesai/gagal dengan id yang sama masih disimpan
    // (removeOnComplete/removeOnFail) dan akan membuat add diabaikan. Hapus
    // dulu supaya slip bisa dibuat lagi; job yang masih menunggu atau
    // berjalan dibiarkan (itu yang mencegah job ganda).
    await Promise.all(
      jobs.map(async ({ itemId }) => {
        const existing = await this.queue.getJob(itemId);
        if (existing && FINISHED.has(await existing.getState())) {
          await existing.remove();
        }
      }),
    );
    await this.queue.addBulk(
      jobs.map((data) => ({
        name: PAYSLIP_PDF_JOB,
        data,
        opts: { ...PAYSLIP_PDF_JOB_OPTIONS, jobId: data.itemId },
      })),
    );
  }
}
