import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv, type Env } from './config/env.validation.js';
import { buildLoggerParams } from './config/logger.config.js';
import { AttendanceModule } from './modules/attendance/attendance.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { EmployeesModule } from './modules/employees/employees.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { KpiModule } from './modules/kpi/kpi.module.js';
import { LeaveModule } from './modules/leave/leave.module.js';
import { MailModule } from './modules/mail/mail.module.js';
import { OrganizationModule } from './modules/organization/organization.module.js';
import { PayrollModule } from './modules/payroll/payroll.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QueueModule } from './queue/queue.module.js';
import { RedisModule } from './redis/redis.module.js';

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
    // Job terjadwal (penandaan alpa 23:59 WIB, saldo cuti 1 Januari 00:05 WIB).
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    // BullMQ: API memasukkan job, proses worker (src/worker.ts) mengerjakannya.
    QueueModule,
    AuditModule,
    MailModule,
    StorageModule,
    AuthModule,
    EmployeesModule,
    OrganizationModule,
    SettingsModule,
    LeaveModule,
    AttendanceModule,
    PayrollModule,
    KpiModule,
    HealthModule,
  ],
})
export class AppModule {}
