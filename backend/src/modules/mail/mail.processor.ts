import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QueueNames } from '../../queue/queue.constants.js';
import { MailService, type MailMessage } from './mail.service.js';

/**
 * Worker queue "mail": kirim satu email per job lewat SMTP. Error dilempar
 * ulang supaya BullMQ mencoba lagi sesuai MAIL_JOB_OPTIONS.
 */
@Processor(QueueNames.mail, { concurrency: 2 })
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mail: MailService) {
    super();
  }

  async process(job: Job<MailMessage>): Promise<void> {
    await this.mail.send(job.data);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<MailMessage> | undefined, error: Error): void {
    this.logger.warn(
      `Email "${job?.data.subject ?? '?'}" gagal (percobaan ${job?.attemptsMade ?? '?'}): ${error.message}`,
    );
  }

  @OnWorkerEvent('error')
  onError(error: Error): void {
    this.logger.warn(`Worker mail: ${error.message}`);
  }
}
