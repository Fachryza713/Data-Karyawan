import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { Env } from './config/env.validation.js';

// Env divalidasi oleh ConfigModule saat AppModule dibuat. Jika ada yang
// kurang, Nest mencetak daftar variabelnya lalu keluar dengan kode 1.
const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  bufferLogs: true,
});
app.useLogger(app.get(Logger));
configureApp(app);
// SIGTERM/SIGINT menjalankan onModuleDestroy/onApplicationShutdown
// (menutup koneksi Prisma dan Redis).
app.enableShutdownHooks();

const config = app.get<ConfigService<Env, true>>(ConfigService);
await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
