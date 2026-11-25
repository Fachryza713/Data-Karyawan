import { jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';
import {
  REQUEST_ID_HEADER,
  requestIdMiddleware,
  resolveRequestId,
} from './request-id.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('memakai id dari klien jika formatnya aman', () => {
    expect(resolveRequestId('abc-123.DEF_4')).toBe('abc-123.DEF_4');
  });

  it.each([
    ['kosong', ''],
    ['karakter berbahaya', 'id\nPalsu: 1'],
    ['terlalu panjang', 'a'.repeat(129)],
    ['bukan string', ['a', 'b']],
    ['tidak ada', undefined],
  ])('membuat UUID baru jika id %s', (_label, incoming) => {
    expect(resolveRequestId(incoming)).toMatch(UUID);
  });
});

describe('requestIdMiddleware', () => {
  it('mengisi req.id dan header respons dengan nilai yang sama', () => {
    const req = { header: () => undefined } as unknown as Request;
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;
    const next = jest.fn() as unknown as NextFunction;

    requestIdMiddleware(req, res, next);

    expect(req.id).toMatch(UUID);
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.id);
    expect(next).toHaveBeenCalled();
  });
});
