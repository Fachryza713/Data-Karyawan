import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../config/env.validation.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { softDeleteExtension } from './soft-delete.extension.js';

/** Buat PrismaClient aplikasi beserta semua extension-nya. */
export function createPrismaClient(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  }).$extends(softDeleteExtension);
}

export type AppPrismaClient = ReturnType<typeof createPrismaClient>;

/**
 * Pemilik koneksi Prisma untuk Nest. Semua query memakai `client`, yang sudah
 * memasang extension (soft delete Employee). PrismaClient polos sengaja tidak
 * diekspos supaya filter soft delete tidak terlewat.
 *
 * Koneksi dibuka saat modul siap dan ditutup saat aplikasi berhenti
 * (SIGTERM/SIGINT lewat enableShutdownHooks).
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: AppPrismaClient;

  constructor(config: ConfigService<Env, true>) {
    this.client = createPrismaClient(
      config.get('DATABASE_URL', { infer: true }),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
