import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants.js';

/** Hapus key hanya jika isinya masih token milik pemanggil. */
const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

/**
 * Lock sederhana antar-instance (SET NX PX). Dipakai job terjadwal supaya
 * hanya satu instance API yang menjalankannya.
 */
@Injectable()
export class RedisLockService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Token lock jika berhasil diambil, null jika sedang dipegang pihak lain. */
  async acquire(key: string, ttlMs: number): Promise<string | null> {
    const token = randomUUID();
    const result = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
    return result === 'OK' ? token : null;
  }

  /** Lepas lock; tidak menghapus lock yang sudah kedaluwarsa lalu diambil pihak lain. */
  async release(key: string, token: string): Promise<boolean> {
    const deleted = await this.redis.eval(RELEASE_SCRIPT, 1, key, token);
    return deleted === 1;
  }
}
