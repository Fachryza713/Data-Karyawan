import { jest } from '@jest/globals';
import {
  RedisThrottlerStorage,
  THROTTLE_SCRIPT,
} from './redis-throttler.storage.js';

// Logika skrip Lua diuji terhadap Redis sungguhan (docker compose);
// di sini yang diuji: argumen ke Redis dan konversi hasil ke format throttler.
describe('RedisThrottlerStorage', () => {
  function setup(result: unknown[]) {
    const evalFn = jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue(result);
    const storage = new RedisThrottlerStorage({
      eval: evalFn,
    });
    return { storage, evalFn };
  }

  it('mengirim skrip dengan kunci per throttler dan parameter jendela/batas', async () => {
    const { storage, evalFn } = setup([1, 60_000, 0, 0]);

    await storage.increment('abc123', 60_000, 5, 60_000, 'login');

    expect(evalFn).toHaveBeenCalledWith(
      THROTTLE_SCRIPT,
      2,
      'throttle:login:abc123:hits',
      'throttle:login:abc123:blocked',
      60_000,
      5,
      60_000,
    );
  });

  it('belum melewati batas: tidak diblokir, waktu dalam detik', async () => {
    const { storage } = setup([3, 42_100, 0, 0]);

    await expect(
      storage.increment('k', 60_000, 5, 60_000, 'login'),
    ).resolves.toEqual({
      totalHits: 3,
      timeToExpire: 43,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('melewati batas: diblokir dengan sisa waktu blokir', async () => {
    const { storage } = setup([6, 60_000, 1, 60_000]);

    await expect(
      storage.increment('k', 60_000, 5, 60_000, 'login'),
    ).resolves.toEqual({
      totalHits: 6,
      timeToExpire: 60,
      isBlocked: true,
      timeToBlockExpire: 60,
    });
  });
});
