import { jest } from '@jest/globals';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthCheckService, TerminusModule } from '@nestjs/terminus';
import { PrismaService } from '../../prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../redis/redis.module.js';
import { HealthController } from './health.controller.js';
import { DatabaseHealthIndicator } from './indicators/database.health.js';
import { RedisHealthIndicator } from './indicators/redis.health.js';

describe('HealthController', () => {
  const queryRaw = jest.fn<() => Promise<unknown>>();
  const ping = jest.fn<() => Promise<string>>();
  let controller: HealthController;

  beforeEach(async () => {
    queryRaw.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    ping.mockReset().mockResolvedValue('PONG');

    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule.forRoot({ logger: false })],
      controllers: [HealthController],
      providers: [
        DatabaseHealthIndicator,
        RedisHealthIndicator,
        {
          provide: PrismaService,
          useValue: { client: { $queryRaw: queryRaw } },
        },
        { provide: REDIS_CLIENT, useValue: { ping } },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('melaporkan ok saat PostgreSQL dan Redis sehat', async () => {
    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.info).toMatchObject({
      database: { status: 'up' },
      redis: { status: 'up' },
    });
    expect(queryRaw).toHaveBeenCalled();
    expect(ping).toHaveBeenCalled();
  });

  it('503 dengan nama dependensi saat PostgreSQL mati', async () => {
    queryRaw.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

    const error = await controller.check().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).message).toBe(
      'Dependensi tidak sehat: database',
    );
  });

  it('503 saat Redis belum siap', async () => {
    ping.mockRejectedValue(
      new Error('LOADING Redis is loading the dataset in memory'),
    );

    const error = await controller.check().catch((e: unknown) => e);

    expect((error as ServiceUnavailableException).message).toBe(
      'Dependensi tidak sehat: redis',
    );
  });

  it('menyebut semua dependensi yang mati', async () => {
    queryRaw.mockRejectedValue(new Error('down'));
    ping.mockRejectedValue(new Error('down'));

    const error = await controller.check().catch((e: unknown) => e);

    expect((error as ServiceUnavailableException).message).toBe(
      'Dependensi tidak sehat: database, redis',
    );
  });

  it('meneruskan error yang bukan dari health check', async () => {
    const health = { check: jest.fn(() => Promise.reject(new Error('bug'))) };
    const direct = new HealthController(
      health as unknown as HealthCheckService,
      {} as DatabaseHealthIndicator,
      {} as RedisHealthIndicator,
    );

    await expect(direct.check()).rejects.toThrow('bug');
  });
});
