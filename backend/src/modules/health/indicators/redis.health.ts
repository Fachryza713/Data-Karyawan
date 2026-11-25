import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../redis/redis.module.js';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly indicators: HealthIndicatorService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  isHealthy(key: string) {
    return this.indicators
      .check(key)
      .attempt(async () => {
        // PING sukses selalu membalas PONG; Redis yang belum siap
        // (mis. LOADING) membalas error sehingga promise ditolak.
        await this.redis.ping();
      })
      .withTimeout(1000);
  }
}
