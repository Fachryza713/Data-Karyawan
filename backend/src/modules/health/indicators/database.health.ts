import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly indicators: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  isHealthy(key: string) {
    return this.indicators
      .check(key)
      .attempt(async () => {
        await this.prisma.client.$queryRaw`SELECT 1`;
      })
      .withTimeout(1000);
  }
}
