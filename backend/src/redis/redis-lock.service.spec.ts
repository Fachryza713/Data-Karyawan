import { jest } from '@jest/globals';
import type { Redis } from 'ioredis';
import { RedisLockService } from './redis-lock.service.js';

function setup() {
  const redis = {
    set: jest.fn<(...args: unknown[]) => Promise<'OK' | null>>(),
    eval: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };
  return { redis, lock: new RedisLockService(redis as unknown as Redis) };
}

describe('RedisLockService', () => {
  it('acquire memakai SET NX PX dengan token acak', async () => {
    const { redis, lock } = setup();
    redis.set.mockResolvedValue('OK');

    const token = await lock.acquire('lock:x', 60_000);

    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    expect(redis.set).toHaveBeenCalledWith('lock:x', token, 'PX', 60_000, 'NX');
  });

  it('acquire mengembalikan null jika key sudah ada', async () => {
    const { redis, lock } = setup();
    redis.set.mockResolvedValue(null);

    await expect(lock.acquire('lock:x', 60_000)).resolves.toBeNull();
  });

  it('release hanya menghapus jika token masih milik pemanggil (Lua)', async () => {
    const { redis, lock } = setup();
    redis.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await expect(lock.release('lock:x', 'token-a')).resolves.toBe(true);
    await expect(lock.release('lock:x', 'token-lain')).resolves.toBe(false);

    const [script, keyCount, key, token] = redis.eval.mock.calls[0];
    expect(script).toContain("redis.call('get', KEYS[1]) == ARGV[1]");
    expect([keyCount, key, token]).toEqual([1, 'lock:x', 'token-a']);
  });
});
