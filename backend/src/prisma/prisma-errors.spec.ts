import { Prisma } from '../generated/prisma/client.js';
import {
  isPrismaError,
  PG_EXCLUSION_VIOLATION,
  postgresErrorCode,
} from './prisma-errors.js';

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('prisma error', {
    code,
    clientVersion: Prisma.prismaVersion.client,
    meta,
  });
}

describe('prisma-errors', () => {
  it('isPrismaError mencocokkan kode Prisma', () => {
    expect(isPrismaError(knownError('P2002'), 'P2002')).toBe(true);
    expect(isPrismaError(knownError('P2025'), 'P2002')).toBe(false);
    expect(isPrismaError(new Error('P2002'), 'P2002')).toBe(false);
  });

  it('postgresErrorCode membaca SQLSTATE dari driver adapter', () => {
    const error = knownError('P2039', {
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: { originalCode: PG_EXCLUSION_VIOLATION, kind: 'postgres' },
      },
    });
    expect(postgresErrorCode(error)).toBe('23P01');
  });

  it('postgresErrorCode null jika tidak ada kode PostgreSQL', () => {
    expect(postgresErrorCode(knownError('P2002'))).toBeNull();
    expect(postgresErrorCode(new Error('boom'))).toBeNull();
    expect(
      postgresErrorCode(
        knownError('P2039', { driverAdapterError: { cause: {} } }),
      ),
    ).toBeNull();
  });
});
