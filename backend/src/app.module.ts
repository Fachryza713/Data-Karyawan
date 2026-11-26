import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv, type Env } from './config/env.validation.js';
import { buildLoggerParams } from './config/logger.config.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { EmployeesModule } from './modules/employees/employees.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MailModule } from './modules/mail/mail.module.js';
import { OrganizationModule } from './modules/organization/organization.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
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
    PrismaModule,
    RedisModule,
    AuditModule,
    MailModule,
    StorageModule,
    AuthModule,
    EmployeesModule,
    OrganizationModule,
    HealthModule,
  ],
})
export class AppModule {}
