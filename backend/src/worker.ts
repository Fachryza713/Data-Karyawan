import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker.module.js';

// Proses worker BullMQ: queue "payslip-pdf" dan "mail". Dijalankan terpisah
// dari API (service "worker" di docker-compose.yml, image yang sama):
//   npm run start:worker:dev   (development, watch)
//   node dist/worker.js        (production)
const app = await NestFactory.createApplicationContext(WorkerModule, {
  bufferLogs: true,
});
app.useLogger(app.get(Logger));
// SIGTERM/SIGINT: worker berhenti mengambil job, menunggu job yang sedang
// berjalan selesai, lalu menutup koneksi Redis dan Prisma.
app.enableShutdownHooks();
app.get(Logger).log('Worker siap: queue payslip-pdf, mail', 'Worker');
