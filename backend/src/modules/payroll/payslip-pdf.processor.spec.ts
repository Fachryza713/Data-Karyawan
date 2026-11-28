import { jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import { type Job, UnrecoverableError } from 'bullmq';
import { type QueryArgs, queryMock } from '../../../test/fixtures/employees.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { MailQueue } from '../mail/mail.queue.js';
import type { MailMessage } from '../mail/mail.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { PayrollMessages } from './payroll.constants.js';
import { PayslipPdfProcessor } from './payslip-pdf.processor.js';
import {
  PAYSLIP_PDF_JOB_OPTIONS,
  type PayslipPdfJobData,
} from './payslip-pdf.queue.js';

const d = (value: string) => new Prisma.Decimal(value);
const ITEM = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e81';
const EMPLOYEE = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e10';
const NOW = new Date('2026-11-28T03:00:00.000Z');
const UPDATED_AT = new Date('2026-11-28T02:59:00.123Z');
const KEY = `payslips/2026-11/${EMPLOYEE}.pdf`;

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM,
    employeeId: EMPLOYEE,
    employeeName: 'Raditya <Pratama>',
    nip: 'BRT-2024-0003',
    departmentName: 'Teknologi Informasi',
    positionName: 'Frontend Developer',
    bankName: 'BCA',
    bankAccountLast4: '8821',
    baseSalary: d('12000000'),
    fixedAllowance: d('3850000'),
    bonus: d('0'),
    gross: d('15850000'),
    bpjsKes: d('120000'),
    bpjsJht: d('317000'),
    bpjsJp: d('105474'),
    pph21: d('250000'),
    otherDeductions: d('0'),
    net: d('15057526'),
    note: null,
    slipStatus: 'QUEUED',
    updatedAt: UPDATED_AT,
    period: { period: '2026-11', status: 'FINAL' },
    employee: { user: { email: 'raditya@bluerose.test' } },
    ...overrides,
  };
}

function setup() {
  const client = {
    payrollItem: {
      findUnique: queryMock().mockResolvedValue(itemRow()),
      updateMany: queryMock().mockResolvedValue({ count: 1 }),
    },
  };
  const storage = {
    putObject: jest
      .fn<StorageService['putObject']>()
      .mockResolvedValue(undefined),
    delete: jest.fn<StorageService['delete']>().mockResolvedValue(undefined),
  };
  const mailQueue = {
    enqueue: jest.fn<MailQueue['enqueue']>().mockResolvedValue(undefined),
  };
  const config = { get: () => 'http://localhost:5173/' };
  const processor = new PayslipPdfProcessor(
    { client } as unknown as PrismaService,
    storage as unknown as StorageService,
    mailQueue as unknown as MailQueue,
    { now: () => NOW },
    config as unknown as ConfigService,
  );
  return { processor, client, storage, mailQueue };
}

/** Job seperti yang diberikan BullMQ ke processor di percobaan ke-(attemptsMade + 1). */
function job(attemptsMade = 0, data: Partial<PayslipPdfJobData> = {}) {
  return {
    id: ITEM,
    data: { itemId: ITEM, notify: true, ...data },
    attemptsMade,
    opts: { ...PAYSLIP_PDF_JOB_OPTIONS, jobId: ITEM },
  } as unknown as Job<PayslipPdfJobData>;
}

const updateCalls = (client: ReturnType<typeof setup>['client']) =>
  client.payrollItem.updateMany.mock.calls.map(([args]: [QueryArgs]) => args);

describe('PayslipPdfProcessor', () => {
  it('render PDF dari snapshot, upload ke payslips/<period>/<employeeId>.pdf, lalu READY', async () => {
    const { processor, client, storage } = setup();

    const result = await processor.process(job());

    expect(result).toEqual({ outcome: 'ready', key: KEY, notified: true });
    expect(storage.putObject).toHaveBeenCalledTimes(1);
    const [key, body, contentType] = storage.putObject.mock.calls[0];
    expect(key).toBe(KEY);
    expect(contentType).toBe('application/pdf');
    expect(Buffer.from(body).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // READY hanya jika slip masih QUEUED dan belum berubah sejak dibaca.
    expect(updateCalls(client)).toEqual([
      {
        where: { id: ITEM, slipStatus: 'QUEUED', updatedAt: UPDATED_AT },
        data: { slipStatus: 'READY', slipKey: KEY, slipError: null },
      },
    ]);
  });

  it('setelah READY: email "Slip gaji <bulan> sudah terbit" ke queue mail, isinya link (bukan lampiran)', async () => {
    const { processor, mailQueue, storage } = setup();

    await processor.process(job());

    expect(mailQueue.enqueue).toHaveBeenCalledTimes(1);
    const [message] = mailQueue.enqueue.mock.calls[0] as [MailMessage];
    expect(message).toEqual({
      to: 'raditya@bluerose.test',
      subject: 'Slip gaji November 2026 sudah terbit',
      text: expect.stringContaining('http://localhost:5173/app/gaji'),
      html: expect.stringContaining(
        '<a href="http://localhost:5173/app/gaji">',
      ),
    });
    expect(Object.keys(message).sort()).toEqual([
      'html',
      'subject',
      'text',
      'to',
    ]);
    expect(message.html).toContain('Raditya &lt;Pratama&gt;');
    // Email diantre setelah PDF tersimpan.
    expect(storage.putObject.mock.invocationCallOrder[0]).toBeLessThan(
      mailQueue.enqueue.mock.invocationCallOrder[0],
    );
  });

  it('notify false (regenerate slip yang sudah pernah READY): tanpa email', async () => {
    const { processor, mailQueue } = setup();

    const result = await processor.process(job(0, { notify: false }));

    expect(result).toMatchObject({ outcome: 'ready', notified: false });
    expect(mailQueue.enqueue).not.toHaveBeenCalled();
  });

  it('email gagal diantre: slip tetap READY, job tidak gagal', async () => {
    const { processor, mailQueue } = setup();
    mailQueue.enqueue.mockRejectedValue(new Error('Redis down'));

    await expect(processor.process(job())).resolves.toMatchObject({
      outcome: 'ready',
      notified: false,
    });
  });

  it.each([
    [
      'periode dibuka kembali (DRAFT)',
      { period: { period: '2026-11', status: 'DRAFT' } },
    ],
    ['slip sudah READY', { slipStatus: 'READY' }],
    ['slip FAILED (ditandai gagal masuk antrean)', { slipStatus: 'FAILED' }],
    ['slip NONE', { slipStatus: 'NONE' }],
  ])('dilewati tanpa membuat PDF: %s', async (_case, overrides) => {
    const { processor, client, storage, mailQueue } = setup();
    client.payrollItem.findUnique.mockResolvedValue(itemRow(overrides));

    await expect(processor.process(job())).resolves.toEqual({
      outcome: 'skipped',
      reason: 'not-queued',
    });
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(client.payrollItem.updateMany).not.toHaveBeenCalled();
    expect(mailQueue.enqueue).not.toHaveBeenCalled();
  });

  it('slip sudah dihapus: dilewati', async () => {
    const { processor, client, storage } = setup();
    client.payrollItem.findUnique.mockResolvedValue(null);

    await expect(processor.process(job())).resolves.toEqual({
      outcome: 'skipped',
      reason: 'item-missing',
    });
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('reopen terjadi saat PDF dibuat: file baru dihapus, tidak READY, tanpa email', async () => {
    const { processor, client, storage, mailQueue } = setup();
    client.payrollItem.updateMany.mockResolvedValue({ count: 0 });
    client.payrollItem.findUnique
      .mockResolvedValueOnce(itemRow())
      .mockResolvedValueOnce({
        slipStatus: 'NONE',
        period: { status: 'DRAFT' },
      });

    await expect(processor.process(job())).resolves.toEqual({
      outcome: 'skipped',
      reason: 'changed',
    });
    expect(storage.delete).toHaveBeenCalledWith(KEY);
    expect(mailQueue.enqueue).not.toHaveBeenCalled();
  });

  it('slip berubah tapi masih QUEUED (regenerate di tengah render): error supaya dicoba lagi dengan data terbaru', async () => {
    const { processor, client, storage } = setup();
    client.payrollItem.updateMany.mockResolvedValue({ count: 0 });
    client.payrollItem.findUnique
      .mockResolvedValueOnce(itemRow())
      .mockResolvedValueOnce({
        slipStatus: 'QUEUED',
        period: { status: 'FINAL' },
      });

    await expect(processor.process(job())).rejects.toThrow(
      PayrollMessages.slipChangedDuringRender,
    );
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('gagal di percobaan yang masih punya retry: error dilempar, status tetap QUEUED', async () => {
    const { processor, client, storage } = setup();
    storage.putObject.mockRejectedValue(new Error('MinIO timeout'));

    await expect(processor.process(job(0))).rejects.toThrow('MinIO timeout');
    expect(client.payrollItem.updateMany).not.toHaveBeenCalled();
  });

  it('job yang gagal berstatus FAILED + slipError setelah retry habis (1 + 3 retry)', async () => {
    const { processor, client, storage } = setup();
    storage.putObject.mockRejectedValue(new Error('MinIO timeout'));
    const attempts = PAYSLIP_PDF_JOB_OPTIONS.attempts;
    expect(attempts).toBe(4);

    // Ulangi seperti BullMQ: attemptsMade naik setiap kali gagal, berhenti
    // saat attemptsMade + 1 >= attempts (Job.shouldRetryJob).
    let attemptsMade = 0;
    const statusAfterEachAttempt: string[] = [];
    for (;;) {
      await expect(processor.process(job(attemptsMade))).rejects.toThrow(
        'MinIO timeout',
      );
      statusAfterEachAttempt.push(
        client.payrollItem.updateMany.mock.calls.length ? 'FAILED' : 'QUEUED',
      );
      const willRetry = attemptsMade + 1 < attempts;
      attemptsMade += 1;
      if (!willRetry) {
        break;
      }
    }

    expect(storage.putObject).toHaveBeenCalledTimes(4);
    expect(statusAfterEachAttempt).toEqual([
      'QUEUED',
      'QUEUED',
      'QUEUED',
      'FAILED',
    ]);
    expect(updateCalls(client)).toEqual([
      {
        where: { id: ITEM, slipStatus: 'QUEUED' },
        data: { slipStatus: 'FAILED', slipError: 'MinIO timeout' },
      },
    ]);
  });

  it('UnrecoverableError: FAILED langsung (BullMQ tidak mencoba lagi)', async () => {
    const { processor, client, storage } = setup();
    storage.putObject.mockRejectedValue(new UnrecoverableError('rusak'));

    await expect(processor.process(job(0))).rejects.toThrow('rusak');
    expect(updateCalls(client)).toEqual([
      {
        where: { id: ITEM, slipStatus: 'QUEUED' },
        data: { slipStatus: 'FAILED', slipError: 'rusak' },
      },
    ]);
  });

  it('gagal menyimpan FAILED tidak menutupi error aslinya', async () => {
    const { processor, client, storage } = setup();
    storage.putObject.mockRejectedValue(new Error('MinIO timeout'));
    client.payrollItem.updateMany.mockRejectedValue(new Error('DB down'));

    await expect(processor.process(job(3))).rejects.toThrow('MinIO timeout');
  });
});
