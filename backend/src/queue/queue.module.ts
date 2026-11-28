import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Global, Injectable, Logger, Module } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { Env } from '../config/env.validation.js';
import { QUEUE_PREFIX, QueueNames } from './queue.constants.js';

const queues = BullModule.registerQueue(
  { name: QueueNames.payslipPdf },
  { name: QueueNames.mail },
);

/**
 * Error koneksi Redis dari Queue dicatat lewat logger aplikasi. Tanpa
 * listener, BullMQ mencetaknya ke console di setiap percobaan reconnect.
 * Pesan yang sama hanya dicatat sekali sampai pesannya berubah.
 */
@Injectable()
class QueueErrorLogger implements OnModuleInit {
  private readonly logger = new Logger('Queue');

  constructor(
    @InjectQueue(QueueNames.payslipPdf) private readonly payslipPdf: Queue,
    @InjectQueue(QueueNames.mail) private readonly mail: Queue,
  ) {}

  onModuleInit(): void {
    for (const queue of [this.payslipPdf, this.mail]) {
      let lastError: string | undefined;
      queue.on('error', (error: NodeJS.ErrnoException) => {
        const reason = error.message || error.code || error.name;
        if (reason !== lastError) {
          lastError = reason;
          this.logger.warn(`Queue ${queue.name}: ${reason}`);
        }
      });
    }
  }
}

/**
 * BullMQ di atas REDIS_URL. Dipakai API (menambah job) dan worker
 * (memproses job). Koneksi blocking milik Worker diatur BullMQ sendiri
 * (maxRetriesPerRequest null).
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const url: string = config.get('REDIS_URL', { infer: true });
        return { connection: { url }, prefix: QUEUE_PREFIX };
      },
    }),
    queues,
  ],
  providers: [QueueErrorLogger],
  exports: [queues],
})
export class QueueModule {}
