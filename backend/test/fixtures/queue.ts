import { jest } from '@jest/globals';
import { getQueueToken } from '@nestjs/bullmq';
import type { TestingModuleBuilder } from '@nestjs/testing';
import type { JobState } from 'bullmq';
import { ALL_QUEUES } from '../../src/queue/queue.constants.js';

/** Job yang tersimpan di FakeQueue. */
export type FakeJob = {
  id: string;
  name: string;
  data: unknown;
  opts: Record<string, unknown>;
  state: JobState;
};

type BulkJob = {
  name: string;
  data: unknown;
  opts?: { jobId?: string } & Record<string, unknown>;
};

/**
 * Pengganti Queue BullMQ di unit test, tanpa Redis. Meniru aturan BullMQ
 * yang diandalkan kode: add dengan jobId yang masih tersimpan (state apa
 * pun, termasuk completed/failed) diabaikan sampai job itu dihapus.
 */
export class FakeQueue {
  readonly name: string;
  readonly jobs = new Map<string, FakeJob>();
  /** Semua panggilan add/addBulk, termasuk yang diabaikan karena jobId sama. */
  readonly requested: BulkJob[] = [];
  private sequence = 0;

  readonly getJob = jest.fn((id: string) => {
    const job = this.jobs.get(id);
    if (!job) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve({
      id,
      getState: () => Promise.resolve(job.state),
      remove: () => {
        this.jobs.delete(id);
        return Promise.resolve();
      },
    });
  });

  readonly addBulk = jest.fn((jobs: BulkJob[]) => {
    for (const job of jobs) {
      this.store(job);
    }
    return Promise.resolve([]);
  });

  readonly add = jest.fn(
    (name: string, data: unknown, opts?: BulkJob['opts']) => {
      this.store({ name, data, opts });
      return Promise.resolve({});
    },
  );

  readonly on = jest.fn();
  /** Bull Board mengenali queue BullMQ dari metaValues.version. */
  readonly metaValues = { version: 'bullmq:fake' };
  readonly close = jest.fn(() => Promise.resolve());

  constructor(name = 'fake') {
    this.name = name;
  }

  /** Ubah state job (mis. completed/failed) seperti setelah diproses worker. */
  finish(id: string, state: JobState): void {
    const job = this.jobs.get(id);
    if (job) {
      job.state = state;
    }
  }

  private store(job: BulkJob): void {
    this.requested.push(job);
    const id = job.opts?.jobId ?? `auto-${++this.sequence}`;
    if (this.jobs.has(id)) {
      return;
    }
    this.jobs.set(id, {
      id,
      name: job.name,
      data: job.data,
      opts: job.opts ?? {},
      state: 'waiting',
    });
  }
}

/** Override token queue BullMQ di test e2e (AppModule tanpa Redis). */
export function queueOverrides(): Array<{ token: string; value: FakeQueue }> {
  return ALL_QUEUES.map((name) => ({
    token: getQueueToken(name),
    value: new FakeQueue(name),
  }));
}

/**
 * Ganti semua Queue BullMQ dengan FakeQueue, supaya AppModule di test e2e
 * tidak membuka koneksi Redis. Pakai: withFakeQueues(Test.createTestingModule(...)).
 */
export function withFakeQueues(
  builder: TestingModuleBuilder,
): TestingModuleBuilder {
  for (const { token, value } of queueOverrides()) {
    builder.overrideProvider(token).useValue(value);
  }
  return builder;
}
