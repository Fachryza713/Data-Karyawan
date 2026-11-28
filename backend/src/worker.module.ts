import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { Clock } from './common/time/clock.js';
import { validateEnv, type Env } from './config/env.validation.js';
import { buildLoggerParams } from './config/logger.config.js';
import { MailModule } from './modules/mail/mail.module.js';
import { MailProcessor } from './modules/mail/mail.processor.js';
import { PayslipPdfProcessor } from './modules/payroll/payslip-pdf.processor.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QueueModule } from './queue/queue.module.js';

/**
 * Proses worker (src/worker.ts): hanya processor BullMQ, tanpa HTTP,
 * controller, atau job terjadwal. Env divalidasi dengan skema yang sama
 * dengan API.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        buildLoggerParams(config),
    }),
    PrismaModule,
    QueueModule,
    StorageModule,
    MailModule,
  ],
  providers: [PayslipPdfProcessor, MailProcessor, Clock],
})
export class WorkerModule {}
