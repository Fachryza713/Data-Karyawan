import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  LeaveRequestKind,
  LeaveRequestStatus,
} from '../../generated/prisma/enums.js';
import {
  addDays,
  assertAttachmentRule,
  assertDateRange,
  assertHasWorkingDays,
  assertNotOwnRequest,
  assertRequestShape,
  assertSingleYear,
  assertSubmissionWindow,
  assertTransition,
  assertWithinQuota,
  attendanceStatusFor,
  canTransition,
  isAttachmentRequired,
  rangesOverlap,
  remoteModeFor,
} from './leave-rules.js';
import { LeaveMessages } from './leave.constants.js';

const { PENDING, APPROVED, REJECTED, CANCELLED } = LeaveRequestStatus;
const { LEAVE, WFH, BUSINESS_TRIP } = LeaveRequestKind;

// Kamis 26 Nov 2026 (WIB).
const TODAY = '2026-11-26';

const annual = {
  code: 'ANNUAL',
  name: 'Cuti tahunan',
  deductsQuota: true,
  attachmentRequiredAfterDays: null,
};
const sick = {
  code: 'SICK',
  name: 'Sakit',
  deductsQuota: false,
  attachmentRequiredAfterDays: 1,
};
const special = {
  code: 'SPECIAL',
  name: 'Izin khusus',
  deductsQuota: false,
  attachmentRequiredAfterDays: null,
};

describe('transisi status', () => {
  it.each([APPROVED, REJECTED, CANCELLED])('PENDING -> %s boleh', (to) => {
    expect(canTransition(PENDING, to)).toBe(true);
    expect(() => assertTransition(PENDING, to)).not.toThrow();
  });

  it('PENDING -> PENDING tidak termasuk transisi', () => {
    expect(canTransition(PENDING, PENDING)).toBe(false);
  });

  const finals = [APPROVED, REJECTED, CANCELLED] as const;
  const all = [PENDING, APPROVED, REJECTED, CANCELLED] as const;
  it.each(finals.flatMap((from) => all.map((to) => [from, to] as const)))(
    'status final %s -> %s ditolak 409',
    (from, to) => {
      expect(canTransition(from, to)).toBe(false);
      expect(() => assertTransition(from, to)).toThrow(ConflictException);
    },
  );

  it('pesan 409 menyebut status saat ini', () => {
    expect(() => assertTransition(APPROVED, CANCELLED)).toThrow(
      'Pengajuan ini sudah disetujui dan tidak bisa diubah lagi',
    );
    expect(() => assertTransition(CANCELLED, APPROVED)).toThrow(
      'Pengajuan ini sudah dibatalkan dan tidak bisa diubah lagi',
    );
  });

  it('HR tidak boleh memproses pengajuan sendiri (403)', () => {
    expect(() => assertNotOwnRequest('user-1', 'user-1')).toThrow(
      new ForbiddenException(LeaveMessages.ownRequest),
    );
    expect(() => assertNotOwnRequest('user-1', 'user-2')).not.toThrow();
  });
});

describe('tumpang tindih tanggal', () => {
  const base = { start: '2026-12-07', end: '2026-12-11' };

  it.each([
    ['sama persis', '2026-12-07', '2026-12-11'],
    ['di dalam', '2026-12-08', '2026-12-09'],
    ['membungkus', '2026-12-01', '2026-12-31'],
    ['berbagi hari pertama', '2026-12-01', '2026-12-07'],
    ['berbagi hari terakhir', '2026-12-11', '2026-12-15'],
  ])('%s: tumpang tindih', (_label, start, end) => {
    expect(rangesOverlap(base, { start, end })).toBe(true);
    expect(rangesOverlap({ start, end }, base)).toBe(true);
  });

  it.each([
    ['tepat sebelum', '2026-12-01', '2026-12-06'],
    ['tepat sesudah', '2026-12-12', '2026-12-18'],
  ])('%s: tidak tumpang tindih', (_label, start, end) => {
    expect(rangesOverlap(base, { start, end })).toBe(false);
    expect(rangesOverlap({ start, end }, base)).toBe(false);
  });

  it('start setelah end ditolak 400', () => {
    expect(() =>
      assertDateRange({ start: '2026-12-08', end: '2026-12-07' }),
    ).toThrow(new BadRequestException(LeaveMessages.invalidRange));
    expect(() =>
      assertDateRange({ start: '2026-12-07', end: '2026-12-07' }),
    ).not.toThrow();
  });
});

describe('aturan H-1 dan batas tanggal', () => {
  it.each([WFH, BUSINESS_TRIP])(
    '%s mulai hari ini atau kemarin ditolak 422',
    (kind) => {
      for (const start of [TODAY, '2026-11-25']) {
        expect(() =>
          assertSubmissionWindow(kind, { start, end: '2026-11-30' }, TODAY),
        ).toThrow(
          new UnprocessableEntityException(LeaveMessages.remoteNoticeH1),
        );
      }
    },
  );

  it.each([WFH, BUSINESS_TRIP])('%s mulai besok (H-1) diterima', (kind) => {
    expect(() =>
      assertSubmissionWindow(
        kind,
        { start: '2026-11-27', end: '2026-11-27' },
        TODAY,
      ),
    ).not.toThrow();
  });

  it('H-1 dihitung lintas bulan dan tahun', () => {
    expect(() =>
      assertSubmissionWindow(
        WFH,
        { start: '2027-01-01', end: '2027-01-01' },
        '2026-12-31',
      ),
    ).not.toThrow();
    expect(() =>
      assertSubmissionWindow(
        WFH,
        { start: '2026-12-31', end: '2027-01-01' },
        '2026-12-31',
      ),
    ).toThrow(UnprocessableEntityException);
  });

  it('cuti boleh hari ini dan sampai 7 hari ke belakang', () => {
    for (const start of [TODAY, '2026-11-19']) {
      expect(() =>
        assertSubmissionWindow(LEAVE, { start, end: TODAY }, TODAY),
      ).not.toThrow();
    }
    expect(() =>
      assertSubmissionWindow(LEAVE, { start: '2026-11-18', end: TODAY }, TODAY),
    ).toThrow(new UnprocessableEntityException(LeaveMessages.tooFarBack));
  });

  it('selesai lebih dari 365 hari dari hari ini ditolak', () => {
    expect(() =>
      assertSubmissionWindow(
        LEAVE,
        { start: '2027-11-20', end: '2027-11-26' },
        TODAY,
      ),
    ).not.toThrow();
    expect(() =>
      assertSubmissionWindow(
        WFH,
        { start: '2027-11-20', end: '2027-11-27' },
        TODAY,
      ),
    ).toThrow(new UnprocessableEntityException(LeaveMessages.tooFarAhead));
  });

  it('addDays lintas bulan/tahun', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('rentang tanpa hari kerja ditolak 422', () => {
    expect(() => assertHasWorkingDays(0)).toThrow(
      new UnprocessableEntityException(LeaveMessages.noWorkingDays),
    );
    expect(() => assertHasWorkingDays(1)).not.toThrow();
  });
});

describe('bentuk pengajuan per kind', () => {
  const typeId = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e70';

  it('LEAVE wajib leaveTypeId', () => {
    expect(() => assertRequestShape({ kind: LEAVE })).toThrow(
      new BadRequestException(LeaveMessages.leaveTypeRequired),
    );
    expect(() =>
      assertRequestShape({
        kind: LEAVE,
        leaveTypeId: typeId,
        attachmentKey: 'leave/x/y',
      }),
    ).not.toThrow();
  });

  it('dinas luar wajib lokasi tujuan', () => {
    expect(() => assertRequestShape({ kind: BUSINESS_TRIP })).toThrow(
      new BadRequestException(LeaveMessages.destinationRequired),
    );
    expect(() =>
      assertRequestShape({ kind: BUSINESS_TRIP, destination: 'Surabaya' }),
    ).not.toThrow();
  });

  it.each([
    [{ kind: WFH, leaveTypeId: typeId }, LeaveMessages.leaveTypeOnlyForLeave],
    [
      { kind: WFH, attachmentKey: 'leave/x/y' },
      LeaveMessages.attachmentOnlyForLeave,
    ],
    [
      { kind: WFH, destination: 'Bandung' },
      LeaveMessages.destinationOnlyForTrip,
    ],
    [
      { kind: LEAVE, leaveTypeId: typeId, destination: 'Bandung' },
      LeaveMessages.destinationOnlyForTrip,
    ],
  ])('field di luar kind-nya ditolak 400 (%o)', (input, message) => {
    expect(() => assertRequestShape(input)).toThrow(
      new BadRequestException(message),
    );
  });

  it('WFH tanpa field tambahan diterima', () => {
    expect(() => assertRequestShape({ kind: WFH })).not.toThrow();
  });
});

describe('aturan lampiran', () => {
  it('sakit 1 hari kerja: lampiran opsional', () => {
    expect(isAttachmentRequired(sick, 1)).toBe(false);
    expect(() => assertAttachmentRule(sick, 1, undefined)).not.toThrow();
  });

  it('sakit lebih dari 1 hari kerja tanpa lampiran ditolak 422', () => {
    expect(isAttachmentRequired(sick, 2)).toBe(true);
    expect(() => assertAttachmentRule(sick, 2, undefined)).toThrow(
      UnprocessableEntityException,
    );
    expect(() => assertAttachmentRule(sick, 2, undefined)).toThrow(
      'Sakit lebih dari 1 hari kerja wajib melampirkan dokumen pendukung (misalnya surat dokter)',
    );
  });

  it('sakit lebih dari 1 hari kerja dengan lampiran diterima', () => {
    expect(() => assertAttachmentRule(sick, 5, 'leave/emp/key')).not.toThrow();
  });

  it('cuti tahunan dan izin khusus tidak wajib lampiran', () => {
    expect(() => assertAttachmentRule(annual, 10, undefined)).not.toThrow();
    expect(() => assertAttachmentRule(special, 10, undefined)).not.toThrow();
  });
});

describe('kuota cuti tahunan', () => {
  it('tidak boleh melebihi sisa kuota (quota - used)', () => {
    const balance = { year: 2026, quota: 12, used: 9 };
    expect(() => assertWithinQuota(balance, 3)).not.toThrow();
    expect(() => assertWithinQuota(balance, 4)).toThrow(
      new UnprocessableEntityException({
        message:
          'Saldo cuti tidak cukup: sisa 3 hari kerja di 2026, diajukan 4 hari kerja',
        details: { year: 2026, remainingDays: 3, workingDays: 4 },
      }),
    );
  });

  it('cuti tahunan tidak boleh lintas tahun; jenis lain boleh', () => {
    const range = { start: '2026-12-30', end: '2027-01-04' };
    expect(() => assertSingleYear(annual, range)).toThrow(
      new UnprocessableEntityException(LeaveMessages.crossYear),
    );
    expect(() => assertSingleYear(sick, range)).not.toThrow();
  });
});

describe('dampak ke presensi', () => {
  it.each([
    ['ANNUAL', 'LEAVE'],
    ['SICK', 'SICK'],
    ['SPECIAL', 'PERMIT'],
    ['MATERNITY', 'PERMIT'],
  ])('jenis %s -> status presensi %s', (code, status) => {
    expect(attendanceStatusFor(code)).toBe(status);
  });

  it('mode absen mengikuti kind izin', () => {
    expect(remoteModeFor(WFH)).toBe('WFH');
    expect(remoteModeFor(BUSINESS_TRIP)).toBe('BUSINESS_TRIP');
  });
});
