import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import { QueueNames } from '../../queue/queue.constants.js';
import type { MailMessage } from './mail.service.js';

export const MAIL_JOB = 'send';

/**
 * Email gagal (SMTP mati/menolak) dicoba ulang 5 kali dengan jeda
 * eksponensial mulai 30 detik. Job selesai disimpan 1 hari, job gagal
 * 7 hari (terlihat di Bull Board).
 */
export const MAIL_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
} as const satisfies JobsOptions;

/** Antre email di queue "mail"; dikirim MailProcessor di proses worker. */
@Injectable()
export class MailQueue {
  constructor(@InjectQueue(QueueNames.mail) private readonly queue: Queue) {}

  /** `jobId` opsional: job dengan id yang masih ada tidak ditambah lagi. */
  async enqueue(message: MailMessage, jobId?: string): Promise<void> {
    await this.queue.add(MAIL_JOB, message, {
      ...MAIL_JOB_OPTIONS,
      ...(jobId ? { jobId } : {}),
    });
  }
}
