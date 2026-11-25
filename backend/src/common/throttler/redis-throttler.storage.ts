import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';

// Tipe ini tidak diekspor dari index @nestjs/throttler.
type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

/**
 * Hitung satu percobaan secara atomik di Redis.
 *
 * KEYS[1] = penghitung, KEYS[2] = penanda blokir
 * ARGV[1] = jendela (ms), ARGV[2] = batas, ARGV[3] = lama blokir (ms)
 * Hasil: { totalHits, sisa jendela (ms), diblokir (0/1), sisa blokir (ms) }
 *
 * Saat batas terlewati penghitung dihapus, jadi setelah blokir selesai
 * hitungan mulai lagi dari nol (sama dengan storage bawaan @nestjs/throttler).
 */
export const THROTTLE_SCRIPT = `
local hits_key = KEYS[1]
local block_key = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local block_duration = tonumber(ARGV[3])

local block_ttl = redis.call('PTTL', block_key)
if block_ttl > 0 then
  return { limit + 1, block_ttl, 1, block_ttl }
end

local hits = redis.call('INCR', hits_key)
if hits == 1 or redis.call('PTTL', hits_key) < 0 then
  redis.call('PEXPIRE', hits_key, ttl)
end

if hits > limit then
  redis.call('DEL', hits_key)
  redis.call('SET', block_key, '1', 'PX', block_duration)
  return { hits, block_duration, 1, block_duration }
end

return { hits, redis.call('PTTL', hits_key), 0, 0 }
`;

const KEY_PREFIX = 'throttle:';

const toSeconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));

/**
 * Storage @nestjs/throttler di Redis, supaya batas percobaan berlaku sama di
 * semua instance API dan tidak hilang saat restart.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Pick<Redis, 'eval'>) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    // key dari ThrottlerGuard sudah berupa hash (route + nama + tracker).
    const base = `${KEY_PREFIX}${throttlerName}:${key}`;
    const result = (await this.redis.eval(
      THROTTLE_SCRIPT,
      2,
      `${base}:hits`,
      `${base}:blocked`,
      ttl,
      limit,
      blockDuration,
    )) as [number, number, number, number];

    const [totalHits, timeToExpireMs, isBlocked, timeToBlockExpireMs] =
      result.map(Number);
    return {
      totalHits,
      timeToExpire: toSeconds(timeToExpireMs),
      isBlocked: isBlocked === 1,
      timeToBlockExpire: toSeconds(timeToBlockExpireMs),
    };
  }
}
