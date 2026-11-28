import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation.js';

/** Presigned URL upload berlaku 5 menit. */
export const UPLOAD_URL_TTL_SECONDS = 5 * 60;
/** Presigned URL download (photoUrl) berlaku 1 jam. */
export const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;

/** Nama file untuk header Content-Disposition presigned GET. */
const SAFE_FILE_NAME = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Upload langsung dari browser ke storage: POST multipart/form-data ke `url`
 * berisi semua `fields`, lalu field `file` paling akhir.
 */
export type PresignedUpload = {
  key: string;
  url: string;
  fields: Record<string, string>;
  maxBytes: number;
  expiresAt: Date;
};

export type StoredObject = {
  size: number;
  contentType: string | null;
};

function isNotFound(error: unknown): boolean {
  return (
    error instanceof S3ServiceException &&
    (error.$metadata.httpStatusCode === 404 ||
      error.name === 'NotFound' ||
      error.name === 'NoSuchKey')
  );
}

/**
 * Akses storage S3-compatible (MinIO di lokal). Bucket privat: file hanya
 * bisa dibaca/ditulis lewat presigned URL berumur pendek.
 *
 * Validasi tipe dan ukuran dilakukan pemanggil dengan assertUploadAllowed
 * sebelum createPresignedUpload; policy presigned POST mengunci Content-Type
 * dan batas ukuran yang sama di sisi storage.
 */
@Injectable()
export class StorageService implements OnModuleDestroy {
  /** Untuk request dari API ke storage (jaringan internal). */
  private readonly client: S3Client;
  /** Untuk presigned URL yang dibuka browser (S3_PUBLIC_ENDPOINT). */
  private readonly presigner: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<Env, true>) {
    const endpoint = config.get('S3_ENDPOINT', { infer: true });
    const base = {
      region: config.get('S3_REGION', { infer: true }),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
      },
      // MinIO memakai path-style (http://host:9000/bucket/key).
      forcePathStyle: true,
      // Checksum CRC bawaan SDK baru belum didukung semua storage S3-compatible.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    } as const;
    this.client = new S3Client({ ...base, endpoint });
    this.presigner = new S3Client({
      ...base,
      endpoint: config.get('S3_PUBLIC_ENDPOINT', { infer: true }) ?? endpoint,
    });
    this.bucket = config.get('S3_BUCKET', { infer: true });
  }

  onModuleDestroy(): void {
    this.client.destroy();
    this.presigner.destroy();
  }

  /**
   * Presigned POST untuk satu object key. Storage menolak upload jika
   * Content-Type berbeda atau ukurannya di luar 1..maxBytes byte.
   */
  async createPresignedUpload(
    key: string,
    contentType: string,
    maxBytes: number,
    ttlSeconds = UPLOAD_URL_TTL_SECONDS,
  ): Promise<PresignedUpload> {
    if (!Number.isInteger(maxBytes) || maxBytes < 1) {
      throw new Error(`maxBytes tidak valid: ${maxBytes}`);
    }
    const { url, fields } = await createPresignedPost(this.presigner, {
      Bucket: this.bucket,
      Key: key,
      Conditions: [
        ['content-length-range', 1, maxBytes],
        ['eq', '$Content-Type', contentType],
      ],
      Fields: { 'Content-Type': contentType },
      Expires: ttlSeconds,
    });
    return {
      key,
      url,
      fields,
      maxBytes,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    };
  }

  /**
   * Presigned GET, berlaku `ttlSeconds` detik. `fileName` (huruf, angka,
   * titik, strip, garis bawah) menjadi nama file saat dibuka/diunduh browser.
   */
  async createPresignedDownload(
    key: string,
    ttlSeconds = DOWNLOAD_URL_TTL_SECONDS,
    fileName?: string,
  ): Promise<string> {
    if (fileName !== undefined && !SAFE_FILE_NAME.test(fileName)) {
      throw new Error(`Nama file tidak valid: ${fileName}`);
    }
    return getSignedUrl(
      this.presigner,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(fileName
          ? { ResponseContentDisposition: `inline; filename="${fileName}"` }
          : {}),
      }),
      { expiresIn: ttlSeconds },
    );
  }

  /** Tulis (atau timpa) object dari server, contoh PDF slip dari worker. */
  async putObject(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.byteLength,
      }),
    );
  }

  /** Hapus object. Key yang tidak ada tidak dianggap error (sifat S3). */
  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  /** Ukuran dan Content-Type object, atau null jika belum ada. */
  async stat(key: string): Promise<StoredObject | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        size: head.ContentLength ?? 0,
        contentType: head.ContentType ?? null,
      };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  /** `length` byte pertama object (untuk cek magic bytes). */
  async readStart(key: string, length: number): Promise<Uint8Array> {
    const object = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: `bytes=0-${length - 1}`,
      }),
    );
    return object.Body
      ? await object.Body.transformToByteArray()
      : new Uint8Array();
  }
}
