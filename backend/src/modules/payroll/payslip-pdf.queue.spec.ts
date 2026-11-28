import { jest } from '@jest/globals';
import { FakeQueue } from '../../../test/fixtures/queue.js';
import {
  ENQUEUE_TIMEOUT_MS,
  PAYSLIP_PDF_JOB,
  PayslipPdfQueue,
  type PayslipQueueClient,
} from './payslip-pdf.queue.js';

const jobs = [
  { itemId: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e81', notify: true },
  { itemId: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e82', notify: true },
];

function setup() {
  const queue = new FakeQueue('payslip-pdf');
  const producer = new PayslipPdfQueue(queue as unknown as PayslipQueueClient);
  return { queue, producer };
}

describe('PayslipPdfQueue', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('satu job per slip: jobId = itemId, 1 + 3 retry, backoff eksponensial', async () => {
    const { queue, producer } = setup();

    await producer.enqueue(jobs);

    expect(queue.addBulk).toHaveBeenCalledWith([
      {
        name: PAYSLIP_PDF_JOB,
        data: jobs[0],
        opts: expect.objectContaining({
          jobId: jobs[0].itemId,
          attempts: 4,
          backoff: { type: 'exponential', delay: 5_000 },
        }),
      },
      expect.objectContaining({
        opts: expect.objectContaining({ jobId: jobs[1].itemId }),
      }),
    ]);
    expect([...queue.jobs.keys()]).toEqual(jobs.map((job) => job.itemId));
  });

  it('enqueue dua kali saat job masih menunggu/berjalan: tidak ada job ganda', async () => {
    const { queue, producer } = setup();

    await producer.enqueue(jobs);
    queue.finish(jobs[1].itemId, 'active');
    await producer.enqueue(jobs);

    expect(queue.requested).toHaveLength(4);
    expect(queue.jobs.size).toBe(2);
  });

  it('job lama yang sudah selesai/gagal dihapus dulu supaya slip bisa dibuat ulang', async () => {
    const { queue, producer } = setup();
    await producer.enqueue(jobs);
    queue.finish(jobs[0].itemId, 'completed');
    queue.finish(jobs[1].itemId, 'failed');

    await producer.enqueue(jobs);

    expect(queue.jobs.size).toBe(2);
    expect([...queue.jobs.values()].map((job) => job.state)).toEqual([
      'waiting',
      'waiting',
    ]);
  });

  it('daftar kosong: tidak menyentuh Redis', async () => {
    const { queue, producer } = setup();

    await producer.enqueue([]);

    expect(queue.getJob).not.toHaveBeenCalled();
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it(`Redis tidak merespons ${ENQUEUE_TIMEOUT_MS} ms: enqueue gagal (tidak menggantung)`, async () => {
    jest.useFakeTimers();
    const { queue, producer } = setup();
    queue.getJob.mockReturnValue(new Promise(() => undefined));

    const pending = producer.enqueue(jobs);
    jest.advanceTimersByTime(ENQUEUE_TIMEOUT_MS);

    await expect(pending).rejects.toThrow('Redis tidak merespons');
  });
});
