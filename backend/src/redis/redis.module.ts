import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.validation.js';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

function createRedisClient(config: ConfigService<Env, true>): Redis {
  const logger = new Logger('Redis');
  const client = new Redis(config.get('REDIS_URL', { infer: true }), {
    // Perintah gagal cepat saat Redis mati, supaya request tidak menggantung.
    maxRetriesPerRequest: 2,
  });

  // Tanpa listener, ioredis mencetak "Unhandled error event" di setiap retry.
  // Pesan yang sama hanya dicatat sekali sampai koneksi pulih.
  let lastError: string | undefined;
  client.on('error', (error: NodeJS.ErrnoException) => {
    // ECONNREFUSED ke "localhost" (IPv4 + IPv6) berupa AggregateError
    // dengan message kosong; kodenya tetap terisi.
    const reason = error.message || error.code || error.name;
    if (reason !== lastError) {
      lastError = reason;
      logger.warn(`Koneksi Redis bermasalah: ${reason}`);
    }
  });
  client.on('ready', () => {
    lastError = undefined;
  });

  return client;
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: createRedisClient,
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    // quit() menunggu perintah yang tertunda; jika belum pernah terhubung,
    // putuskan langsung supaya shutdown tidak menggantung.
    if (this.redis.status === 'ready') {
      await this.redis.quit();
    } else {
      this.redis.disconnect();
    }
  }
}
