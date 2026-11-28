import { jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';
import { basicAuth, parseBasicAuth } from './queue-dashboard.js';

const header = (credentials: string) =>
  `Basic ${Buffer.from(credentials, 'utf8').toString('base64')}`;

function call(authorization?: string) {
  const middleware = basicAuth('admin', 'rahasia-panjang-sekali');
  const res = {
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  middleware(
    { headers: { authorization } } as Request,
    res as unknown as Response,
    next as NextFunction,
  );
  return { res, next };
}

describe('basic auth Bull Board', () => {
  it('parseBasicAuth: hanya skema Basic dengan "user:password"', () => {
    expect(parseBasicAuth(header('admin:p:w'))).toBe('admin:p:w');
    expect(parseBasicAuth(undefined)).toBeNull();
    expect(parseBasicAuth('Bearer abc')).toBeNull();
    expect(parseBasicAuth(header('tanpa-titik-dua'))).toBeNull();
    expect(parseBasicAuth('Basic !!!')).toBeNull();
  });

  it('kredensial benar: lanjut ke dashboard', () => {
    const { res, next } = call(header('admin:rahasia-panjang-sekali'));

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([
    ['tanpa header', undefined],
    ['password salah', header('admin:salah')],
    ['user salah', header('root:rahasia-panjang-sekali')],
    ['password lebih panjang', header('admin:rahasia-panjang-sekali!')],
  ])('%s: 401 dengan WWW-Authenticate', (_case, authorization) => {
    const { res, next } = call(authorization);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      expect.stringMatching(/^Basic realm=/),
    );
  });
});
