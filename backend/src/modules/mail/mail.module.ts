import { Global, Module } from '@nestjs/common';
import { MailQueue } from './mail.queue.js';
import { MailService } from './mail.service.js';

/**
 * MailService mengirim langsung lewat SMTP; MailQueue mengantrekan email ke
 * queue "mail" (butuh QueueModule) untuk dikirim proses worker.
 */
@Global()
@Module({
  providers: [MailService, MailQueue],
  exports: [MailService, MailQueue],
})
export class MailModule {}
