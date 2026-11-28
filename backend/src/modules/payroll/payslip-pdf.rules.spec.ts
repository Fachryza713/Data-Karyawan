import { ConflictException } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import {
  PayrollMessages,
  payslipFileName,
  payslipObjectKey,
  SLIP_ERROR_MAX_LENGTH,
} from './payroll.constants.js';
import {
  assertSlipsPublished,
  isFinalAttempt,
  isPublishedPeriod,
  payslipPdfAvailability,
  shouldNotifyOnRegenerate,
  toSlipError,
} from './payslip-pdf.rules.js';

describe('aturan PDF slip', () => {
  it('slip terbit hanya untuk FINAL/PAID; buat ulang di DRAFT = 409', () => {
    expect(isPublishedPeriod('DRAFT')).toBe(false);
    expect(isPublishedPeriod('FINAL')).toBe(true);
    expect(isPublishedPeriod('PAID')).toBe(true);
    expect(() => assertSlipsPublished('DRAFT')).toThrow(
      new ConflictException(PayrollMessages.slipsNotPublished),
    );
    expect(() => assertSlipsPublished('PAID')).not.toThrow();
  });

  it('email "slip terbit" saat regenerate hanya untuk slip yang belum pernah READY', () => {
    expect(shouldNotifyOnRegenerate('FAILED')).toBe(true);
    expect(shouldNotifyOnRegenerate('QUEUED')).toBe(true);
    expect(shouldNotifyOnRegenerate('NONE')).toBe(true);
    expect(shouldNotifyOnRegenerate('READY')).toBe(false);
  });

  it.each([
    [0, 4, false],
    [2, 4, false],
    [3, 4, true],
    [0, 1, true],
    [0, undefined, true],
  ])(
    'attemptsMade %i dari attempts %s: percobaan terakhir = %s',
    (attemptsMade, attempts, final) => {
      expect(
        isFinalAttempt({ attemptsMade, opts: { attempts } }, new Error('x')),
      ).toBe(final);
    },
  );

  it('UnrecoverableError selalu percobaan terakhir', () => {
    expect(
      isFinalAttempt(
        { attemptsMade: 0, opts: { attempts: 4 } },
        new UnrecoverableError('x'),
      ),
    ).toBe(true);
  });

  it('slipError: pesan error (dengan prefix), dipotong ke batas kolom', () => {
    expect(toSlipError(new Error('MinIO timeout'))).toBe('MinIO timeout');
    expect(toSlipError('teks', 'Gagal')).toBe('Gagal: teks');
    const long = toSlipError(new Error('x'.repeat(5000)));
    expect(long).toHaveLength(SLIP_ERROR_MAX_LENGTH);
    expect(long.endsWith('...')).toBe(true);
  });

  it('karyawan: READY = key, QUEUED = masih dibuat, FAILED/NONE = 409 dengan arahan ke HR', () => {
    expect(payslipPdfAvailability('READY', 'payslips/a.pdf')).toEqual({
      status: 'READY',
      key: 'payslips/a.pdf',
    });
    expect(payslipPdfAvailability('QUEUED', null)).toEqual({
      status: 'QUEUED',
    });
    expect(() => payslipPdfAvailability('FAILED', null)).toThrow(
      new ConflictException(PayrollMessages.slipPdfFailed),
    );
    expect(() => payslipPdfAvailability('NONE', null)).toThrow(
      new ConflictException(PayrollMessages.slipPdfNotRequested),
    );
    expect(() => payslipPdfAvailability('READY', null)).toThrow(
      'Slip READY tanpa slipKey',
    );
  });

  it('object key dan nama file PDF', () => {
    expect(payslipObjectKey('2026-11', 'e1')).toBe('payslips/2026-11/e1.pdf');
    expect(payslipFileName('2026-11', 'BRT-2024-0003')).toBe(
      'slip-gaji-2026-11-BRT-2024-0003.pdf',
    );
    expect(payslipFileName('2026-11', 'A/B "C"')).toBe(
      'slip-gaji-2026-11-A-B--C-.pdf',
    );
  });
});
