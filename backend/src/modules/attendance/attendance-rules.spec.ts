import {
  evaluateClockIn,
  isEarlyLeave,
  isOutsideRadius,
  monthBounds,
  resolveRange,
  summarizeMonth,
  timeToSeconds,
  toWibClock,
} from './attendance-rules.js';

const at = (time: string) => {
  const [h, m, s = '0'] = time.split(':');
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
};

const REGULAR = { startTime: '08:30', endTime: '17:30', lateToleranceMin: 15 };

describe('toWibClock (batas tanggal WIB = UTC+7)', () => {
  it.each([
    // 23:30 UTC sudah tanggal berikutnya di WIB.
    ['2026-11-26T23:30:00.000Z', '2026-11-27', '06:30', at('06:30')],
    ['2026-11-26T16:59:59.000Z', '2026-11-26', '23:59', at('23:59:59')],
    ['2026-11-26T17:00:00.000Z', '2026-11-27', '00:00', 0],
    ['2026-11-26T01:27:45.000Z', '2026-11-26', '08:27', at('08:27:45')],
    ['2026-12-31T17:30:00.000Z', '2027-01-01', '00:30', at('00:30')],
  ])('%s -> %s %s', (iso, date, time, secondsOfDay) => {
    expect(toWibClock(new Date(iso))).toEqual({ date, time, secondsOfDay });
  });
});

describe('timeToSeconds', () => {
  it('jam HH:mm ke detik', () => {
    expect(timeToSeconds('00:00')).toBe(0);
    expect(timeToSeconds('08:30')).toBe(30_600);
    expect(timeToSeconds('23:59')).toBe(86_340);
  });
});

describe('evaluateClockIn (jam masuk 08:30, toleransi 15 menit)', () => {
  it.each([
    ['07:55:00', 'ON_TIME', 0],
    ['08:30:00', 'ON_TIME', 0],
    ['08:44:59', 'ON_TIME', 0],
    ['08:45:00', 'ON_TIME', 0], // tepat di batas toleransi
    ['08:45:01', 'LATE', 15], // satu detik lewat toleransi; menit dari jam masuk
    ['08:46:00', 'LATE', 16],
    ['10:00:00', 'LATE', 90],
  ])('masuk %s -> %s, terlambat %p menit', (time, status, lateMinutes) => {
    expect(evaluateClockIn(at(time), REGULAR)).toEqual({ status, lateMinutes });
  });

  it('toleransi 0: lewat beberapa detik tetap terlambat minimal 1 menit', () => {
    const strict = { ...REGULAR, lateToleranceMin: 0 };

    expect(evaluateClockIn(at('08:30:00'), strict)).toEqual({
      status: 'ON_TIME',
      lateMinutes: 0,
    });
    expect(evaluateClockIn(at('08:30:30'), strict)).toEqual({
      status: 'LATE',
      lateMinutes: 1,
    });
  });

  it('toleransi 120 menit', () => {
    const relaxed = { ...REGULAR, lateToleranceMin: 120 };

    expect(evaluateClockIn(at('10:30:00'), relaxed).status).toBe('ON_TIME');
    expect(evaluateClockIn(at('10:31:00'), relaxed)).toEqual({
      status: 'LATE',
      lateMinutes: 121,
    });
  });
});

describe('isEarlyLeave (jam pulang 17:30)', () => {
  it.each([
    ['16:00:00', true],
    ['17:29:59', true],
    ['17:30:00', false],
    ['19:00:00', false],
  ])('pulang %s -> %p', (time, expected) => {
    expect(isEarlyLeave(at(time), REGULAR)).toBe(expected);
  });
});

describe('isOutsideRadius', () => {
  it.each([
    [0, 100, false],
    [99, 100, false],
    [100, 100, false], // tepat di tepi radius: diterima
    [101, 100, true],
    [25, 25, false],
    [26, 25, true],
  ])('jarak %p m, radius %p m -> di luar: %p', (distance, radius, expected) => {
    expect(isOutsideRadius(distance, radius)).toBe(expected);
  });
});

describe('summarizeMonth', () => {
  it('menghitung hadir, terlambat (termasuk yang pulang cepat), cuti, alpa', () => {
    const t = new Date('2026-11-02T01:30:00.000Z');
    const summary = summarizeMonth([
      { status: 'ON_TIME', clockInAt: t, lateMinutes: 0 },
      { status: 'LATE', clockInAt: t, lateMinutes: 12 },
      { status: 'EARLY_LEAVE', clockInAt: t, lateMinutes: 20 },
      { status: 'EARLY_LEAVE', clockInAt: t, lateMinutes: 0 },
      { status: 'LEAVE', clockInAt: null, lateMinutes: 0 },
      { status: 'SICK', clockInAt: null, lateMinutes: 0 },
      { status: 'PERMIT', clockInAt: null, lateMinutes: 0 },
      { status: 'ABSENT', clockInAt: null, lateMinutes: 0 },
      { status: 'ABSENT', clockInAt: null, lateMinutes: 0 },
    ]);

    expect(summary).toEqual({
      present: 4,
      late: 2,
      earlyLeave: 2,
      leave: 1,
      sick: 1,
      permit: 1,
      absent: 2,
    });
  });
});

describe('monthBounds', () => {
  it.each([
    ['2026-11', '2026-11-01', '2026-11-30'],
    ['2026-12', '2026-12-01', '2026-12-31'],
    ['2026-02', '2026-02-01', '2026-02-28'],
    ['2028-02', '2028-02-01', '2028-02-29'],
  ])('%s -> %s s.d. %s', (month, from, to) => {
    expect(monthBounds(month)).toEqual({ from, to });
  });
});

describe('resolveRange', () => {
  const today = '2026-11-26';

  it('tanpa date dan from-to: hari ini, satu tanggal', () => {
    expect(resolveRange({}, today, 93)).toEqual({
      from: today,
      to: today,
      single: true,
    });
  });

  it('date saja: satu tanggal', () => {
    expect(resolveRange({ date: '2026-11-20' }, today, 93)).toEqual({
      from: '2026-11-20',
      to: '2026-11-20',
      single: true,
    });
  });

  it('from = to dianggap satu tanggal', () => {
    expect(
      resolveRange({ from: '2026-11-20', to: '2026-11-20' }, today, 93),
    ).toMatchObject({ single: true });
  });

  it('rentang 93 hari diterima, 94 hari ditolak', () => {
    expect(
      resolveRange({ from: '2026-01-01', to: '2026-04-03' }, today, 93),
    ).toEqual({ from: '2026-01-01', to: '2026-04-03', single: false });
    expect(
      resolveRange({ from: '2026-01-01', to: '2026-04-04' }, today, 93),
    ).toEqual({ error: 'rangeTooLong' });
  });

  it.each([
    [{ date: '2026-11-20', from: '2026-11-01' }, 'dateAndRange'],
    [{ from: '2026-11-01' }, 'incompleteRange'],
    [{ to: '2026-11-30' }, 'incompleteRange'],
    [{ from: '2026-11-30', to: '2026-11-01' }, 'invalidRange'],
  ])('%o -> %s', (filter, error) => {
    expect(resolveRange(filter, today, 93)).toEqual({ error });
  });
});
