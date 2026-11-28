import { jest } from '@jest/globals';
import type { Job } from 'bullmq';
import { FakeQueue } from '../../../test/fixtures/queue.js';
import { MailProcessor } from './mail.processor.js';
import { MAIL_JOB, MAIL_JOB_OPTIONS, MailQueue } from './mail.queue.js';
import type { MailMessage, MailService } from './mail.service.js';

const message: MailMessage = {
  to: 'raditya@bluerose.test',
  subject: 'Slip gaji November 2026 sudah terbit',
  text: 'teks',
  html: '<p>html</p>',
};

describe('queue mail', () => {
  it('MailQueue: satu job "send" berisi pesan, dengan retry dan jobId opsional', async () => {
    const queue = new FakeQueue('mail');
    const mailQueue = new MailQueue(queue as never);

    await mailQueue.enqueue(message);
    await mailQueue.enqueue(message, 'payslip-ready-1');

    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      MAIL_JOB,
      message,
      MAIL_JOB_OPTIONS,
    );
    expect(queue.add).toHaveBeenNthCalledWith(2, MAIL_JOB, message, {
      ...MAIL_JOB_OPTIONS,
      jobId: 'payslip-ready-1',
    });
    expect(MAIL_JOB_OPTIONS.attempts).toBeGreaterThan(1);
  });

  it('MailProcessor mengirim lewat MailService; error dilempar supaya BullMQ retry', async () => {
    const send = jest.fn<MailService['send']>().mockResolvedValue(undefined);
    const processor = new MailProcessor({ send } as unknown as MailService);
    const job = { data: message } as Job<MailMessage>;

    await processor.process(job);
    expect(send).toHaveBeenCalledWith(message);

    send.mockRejectedValue(new Error('SMTP 421'));
    await expect(processor.process(job)).rejects.toThrow('SMTP 421');
  });
});
