import { jest } from '@jest/globals';
import {
  type ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { ErrorResponseDto } from '../dto/error-response.dto.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('prisma error', {
    code,
    clientVersion: Prisma.prismaVersion.client,
    meta,
  });
}

function run(exception: unknown, headersSent = false) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const req = {
    originalUrl: '/api/v1/contoh?x=1',
    url: '/contoh',
    id: 'req-1',
  };
  const res = { status, headersSent };
  const host = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, host);

  const body = json.mock.calls[0]?.[0] as ErrorResponseDto | undefined;
  return { status, json, body };
}

describe('AllExceptionsFilter', () => {
  let logError: jest.SpiedFunction<Logger['error']>;

  beforeEach(() => {
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    logError.mockRestore();
  });

  it('memakai format error seragam', () => {
    const { status, body } = run(
      new NotFoundException('Karyawan tidak ditemukan'),
    );

    expect(status).toHaveBeenCalledWith(404);
    expect(body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Karyawan tidak ditemukan',
      path: '/api/v1/contoh?x=1',
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown,
      requestId: 'req-1',
    });
  });

  it('meneruskan daftar pesan dari ValidationPipe', () => {
    const { body } = run(
      new BadRequestException([
        'email must be an email',
        'name should not be empty',
      ]),
    );

    expect(body?.statusCode).toBe(400);
    expect(body?.error).toBe('Bad Request');
    expect(body?.message).toEqual([
      'email must be an email',
      'name should not be empty',
    ]);
  });

  it('memakai pesan HttpException berbentuk string', () => {
    const { body } = run(new HttpException('Terlalu banyak permintaan', 429));

    expect(body).toMatchObject({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Terlalu banyak permintaan',
    });
  });

  it('memakai pesan default exception bawaan Nest', () => {
    const { body } = run(new ForbiddenException());

    expect(body).toMatchObject({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Forbidden',
    });
  });

  it('menerjemahkan Prisma P2002 (driver adapter) menjadi 409 dengan nama kolom', () => {
    const { body } = run(
      prismaError('P2002', {
        modelName: 'Employee',
        driverAdapterError: {
          cause: {
            kind: 'UniqueConstraintViolation',
            constraint: { fields: ['nip'] },
          },
        },
      }),
    );

    expect(body).toMatchObject({
      statusCode: 409,
      error: 'Conflict',
      message: 'Data dengan nip yang sama sudah ada',
    });
  });

  it('menerjemahkan Prisma P2002 dengan meta.target', () => {
    const { body } = run(
      prismaError('P2002', { target: ['email', 'company_id'] }),
    );

    expect(body?.statusCode).toBe(409);
    expect(body?.message).toBe(
      'Data dengan email, company_id yang sama sudah ada',
    );
  });

  it('tetap 409 walau Prisma tidak menyebut kolomnya', () => {
    const { body } = run(prismaError('P2002'));

    expect(body).toMatchObject({
      statusCode: 409,
      message: 'Data yang sama sudah ada',
    });
  });

  it('menerjemahkan Prisma P2025 menjadi 404', () => {
    const { body } = run(
      prismaError('P2025', { cause: 'No record was found' }),
    );

    expect(body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      message: 'Data tidak ditemukan',
    });
  });

  it('menerjemahkan Prisma P2003 (foreign key masih dipakai) menjadi 409', () => {
    const { body } = run(prismaError('P2003'));

    expect(body).toMatchObject({
      statusCode: 409,
      message: 'Data masih dipakai oleh data lain',
    });
  });

  it('meneruskan details dari HttpException', () => {
    const { body } = run(
      new ConflictException({
        message: 'Departemen masih dipakai',
        details: { employeeCount: 3 },
      }),
    );

    expect(body).toMatchObject({
      statusCode: 409,
      message: 'Departemen masih dipakai',
      details: { employeeCount: 3 },
    });
  });

  it('tidak menambah details jika exception tidak punya', () => {
    const { body } = run(new NotFoundException('Tidak ada'));

    expect(body).not.toHaveProperty('details');
  });

  it('error Prisma lain menjadi 500 tanpa membocorkan detail', () => {
    const { body } = run(prismaError('P2010'));

    expect(body).toMatchObject({
      statusCode: 500,
      message: 'Terjadi kesalahan pada server',
    });
    expect(logError).toHaveBeenCalled();
  });

  it('error tak dikenal menjadi 500 dan dicatat di log', () => {
    const error = new Error('password=rahasia bocor');
    const { body } = run(error);

    expect(body).toMatchObject({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Terjadi kesalahan pada server',
    });
    expect(JSON.stringify(body)).not.toContain('rahasia');
    expect(logError).toHaveBeenCalledWith(error);
  });

  it('tidak mencatat HttpException (4xx atau 5xx yang disengaja) sebagai error', () => {
    run(new ConflictException('Bentrok'));
    run(new ServiceUnavailableException('Dependensi tidak sehat: redis'));

    expect(logError).not.toHaveBeenCalled();
  });

  it('tidak menulis respons jika header sudah terkirim', () => {
    const { status } = run(new Error('stream putus'), true);

    expect(status).not.toHaveBeenCalled();
  });
});
