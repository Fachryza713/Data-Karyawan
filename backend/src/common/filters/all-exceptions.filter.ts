import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { Prisma } from '../../generated/prisma/client.js';
import type { ErrorResponseDto } from '../dto/error-response.dto.js';

interface ResolvedError {
  statusCode: number;
  message: string | string[];
  details?: Record<string, unknown>;
}

const INTERNAL_MESSAGE = 'Terjadi kesalahan pada server';

/**
 * Menangkap semua exception dan mengubahnya ke format error seragam:
 * { statusCode, error, message, path, timestamp, requestId }.
 *
 * - HttpException (termasuk error ValidationPipe) memakai status dan pesannya.
 *   Objek `details` di response exception ikut diteruskan, contoh
 *   `new ConflictException({ message, details: { employeeCount: 3 } })`.
 * - Error Prisma P2002 (unique) dan P2003 (masih direferensikan) menjadi 409,
 *   P2025 (record tidak ada) menjadi 404.
 * - Error lain menjadi 500 tanpa membocorkan detail; detailnya hanya di log.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const { statusCode, message, details } = this.resolve(exception);

    // HttpException 5xx dilempar dengan sengaja (mis. 503 health check);
    // yang perlu stack trace hanya error tak terduga.
    if (statusCode >= 500 && !(exception instanceof HttpException)) {
      this.logger.error(exception);
    }

    if (res.headersSent) {
      return;
    }

    const body: ErrorResponseDto = {
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'Error',
      message,
      path: req.originalUrl ?? req.url,
      timestamp: new Date().toISOString(),
      requestId: typeof req.id === 'string' ? req.id : '',
      ...(details && { details }),
    };

    res.status(statusCode).json(body);
  }

  private resolve(exception: unknown): ResolvedError {
    if (exception instanceof HttpException) {
      return {
        statusCode: exception.getStatus(),
        message: this.httpMessage(exception),
        details: httpDetails(exception),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.prismaError(exception);
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: INTERNAL_MESSAGE,
    };
  }

  private httpMessage(exception: HttpException): string | string[] {
    const response = exception.getResponse();
    if (typeof response === 'string') {
      return response;
    }
    const { message } = response as { message?: unknown };
    if (
      typeof message === 'string' ||
      (Array.isArray(message) && message.every((m) => typeof m === 'string'))
    ) {
      return message;
    }
    return exception.message;
  }

  private prismaError(
    exception: Prisma.PrismaClientKnownRequestError,
  ): ResolvedError {
    switch (exception.code) {
      case 'P2002': {
        const fields = uniqueFields(exception.meta);
        return {
          statusCode: HttpStatus.CONFLICT,
          message: fields.length
            ? `Data dengan ${fields.join(', ')} yang sama sudah ada`
            : 'Data yang sama sudah ada',
        };
      }
      case 'P2003':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'Data masih dipakai oleh data lain',
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Data tidak ditemukan',
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: INTERNAL_MESSAGE,
        };
    }
  }
}

/**
 * Nama kolom yang melanggar unique constraint. Prisma menaruhnya di
 * meta.target (engine klasik) atau meta.driverAdapterError.cause.constraint
 * .fields (driver adapter, dipakai Prisma 7).
 */
function uniqueFields(meta: Record<string, unknown> | undefined): string[] {
  const target = meta?.target;
  if (typeof target === 'string') {
    return [target];
  }
  if (isStringArray(target)) {
    return target;
  }

  const adapterError = meta?.driverAdapterError as
    { cause?: { constraint?: { fields?: unknown } } } | undefined;
  const fields = adapterError?.cause?.constraint?.fields;
  return isStringArray(fields) ? fields : [];
}

function httpDetails(
  exception: HttpException,
): Record<string, unknown> | undefined {
  const response = exception.getResponse();
  if (typeof response !== 'object' || response === null) {
    return undefined;
  }
  const { details } = response as { details?: unknown };
  return typeof details === 'object' &&
    details !== null &&
    !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : undefined;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}
