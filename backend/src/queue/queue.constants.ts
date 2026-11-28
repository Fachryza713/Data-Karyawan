/** Nama queue BullMQ. API hanya menambah job; proses worker (src/worker.ts) yang mengerjakannya. */
export const QueueNames = {
  payslipPdf: 'payslip-pdf',
  mail: 'mail',
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];

export const ALL_QUEUES: readonly QueueName[] = Object.values(QueueNames);

/** Prefix key Redis semua queue (hris:payslip-pdf:...). */
export const QUEUE_PREFIX = 'hris';

/** Path Bull Board (di luar prefix /api/v1). */
export const QUEUE_DASHBOARD_PATH = '/admin/queues';
