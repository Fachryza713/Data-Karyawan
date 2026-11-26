import type { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service.js';

const env: Record<string, string | undefined> = {
  S3_ENDPOINT: 'http://minio:9000',
  S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'hris-files',
  S3_ACCESS_KEY: 'minioadmin',
  S3_SECRET_KEY: 'minioadmin',
};

function createService(overrides: Record<string, string | undefined> = {}) {
  const values = { ...env, ...overrides };
  const config = { get: (key: string) => values[key] };
  return new StorageService(config as unknown as ConfigService);
}

type PostPolicy = {
  expiration: string;
  conditions: Array<Record<string, string> | Array<string | number>>;
};

// Presigned URL dibuat lokal (tanda tangan HMAC), tidak butuh MinIO.
describe('StorageService', () => {
  it('createPresignedUpload: policy mengunci key, Content-Type, dan ukuran 1..maxBytes', async () => {
    const service = createService();
    const before = Date.now();

    const upload = await service.createPresignedUpload(
      'employees/e1/avatar-abc',
      'image/png',
      2_097_152,
    );

    expect(upload.url).toBe('http://localhost:9000/hris-files');
    expect(upload.fields).toMatchObject({
      key: 'employees/e1/avatar-abc',
      'Content-Type': 'image/png',
    });
    const policy = JSON.parse(
      Buffer.from(upload.fields.Policy, 'base64').toString('utf8'),
    ) as PostPolicy;
    expect(policy.conditions).toEqual(
      expect.arrayContaining([
        ['content-length-range', 1, 2_097_152],
        ['eq', '$Content-Type', 'image/png'],
        { key: 'employees/e1/avatar-abc' },
        { bucket: 'hris-files' },
      ]),
    );
    // Berlaku 5 menit.
    const expiresIn = Date.parse(policy.expiration) - before;
    expect(expiresIn).toBeGreaterThan(299_000);
    expect(expiresIn).toBeLessThanOrEqual(301_000);
    expect(upload.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 300_000);
  });

  it('createPresignedUpload menolak maxBytes tidak valid', async () => {
    await expect(
      createService().createPresignedUpload('k', 'image/png', 0),
    ).rejects.toThrow('maxBytes tidak valid');
  });

  it('createPresignedDownload: URL publik bertanda tangan dengan masa berlaku', async () => {
    const url = new URL(
      await createService().createPresignedDownload(
        'employees/e1/avatar-abc',
        600,
      ),
    );

    expect(url.origin).toBe('http://localhost:9000');
    expect(url.pathname).toBe('/hris-files/employees/e1/avatar-abc');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('tanpa S3_PUBLIC_ENDPOINT, presigned URL memakai S3_ENDPOINT', async () => {
    const url = await createService({
      S3_PUBLIC_ENDPOINT: undefined,
    }).createPresignedDownload('a.png');

    expect(url.startsWith('http://minio:9000/hris-files/a.png?')).toBe(true);
  });
});
