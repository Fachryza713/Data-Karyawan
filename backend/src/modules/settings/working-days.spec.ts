import {
  parseDateOnly,
  toDateOnly,
} from '../../common/validation/date-only.js';
import {
  countWorkingDays,
  isWeekend,
  listWorkingDays,
  toCalendarDate,
} from './working-days.js';

// Kalender acuan November 2026: tanggal 1 hari Minggu, 26 hari Kamis.

/** Pembanding sederhana: cek hari satu per satu. */
function countDayByDay(start: string, end: string, holidays: string[]) {
  let count = 0;
  for (
    let day = parseDateOnly(start);
    day <= parseDateOnly(end);
    day = new Date(day.getTime() + 86_400_000)
  ) {
    const date = toDateOnly(day);
    if (!isWeekend(date) && !holidays.includes(date)) {
      count++;
    }
  }
  return count;
}

describe('isWeekend', () => {
  it.each([
    ['2026-11-28', true], // Sabtu
    ['2026-11-29', true], // Minggu
    ['2026-11-27', false], // Jumat
    ['2026-11-30', false], // Senin
  ])('%s -> %p', (date, expected) => {
    expect(isWeekend(date)).toBe(expected);
  });
});

describe('countWorkingDays', () => {
  it('satu hari kerja: 1', () => {
    expect(countWorkingDays('2026-11-26', '2026-11-26', [])).toBe(1);
  });

  it('Senin sampai Jumat: 5', () => {
    expect(countWorkingDays('2026-11-23', '2026-11-27', [])).toBe(5);
  });

  it('melewati akhir pekan: Jumat sampai Senin = 2', () => {
    expect(countWorkingDays('2026-11-27', '2026-11-30', [])).toBe(2);
  });

  it('hanya Sabtu dan Minggu: 0', () => {
    expect(countWorkingDays('2026-11-28', '2026-11-29', [])).toBe(0);
  });

  it('satu bulan penuh (November 2026): 21', () => {
    expect(countWorkingDays('2026-11-01', '2026-11-30', [])).toBe(21);
  });

  it('melewati akhir pekan dan hari libur: Jumat 14 sampai Selasa 18 Agustus 2026 (17 Agustus libur) = 2', () => {
    expect(countWorkingDays('2026-08-14', '2026-08-18', ['2026-08-17'])).toBe(
      2,
    );
  });

  it('libur di hari Minggu tidak mengurangi dua kali (Waisak 31 Mei 2026)', () => {
    // Jumat 29 Mei s.d. Selasa 2 Juni: 31 Mei libur (Minggu), 1 Juni libur (Senin).
    expect(
      countWorkingDays('2026-05-29', '2026-06-02', [
        '2026-05-31',
        '2026-06-01',
      ]),
    ).toBe(2);
  });

  it('libur di luar rentang dan libur ganda diabaikan', () => {
    expect(
      countWorkingDays('2026-11-01', '2026-11-30', [
        '2026-12-25',
        '2026-10-30',
        '2026-11-26',
        '2026-11-26',
      ]),
    ).toBe(20);
  });

  it('libur tepat di tanggal awal dan akhir ikut dikurangi', () => {
    expect(
      countWorkingDays('2026-11-23', '2026-11-27', [
        '2026-11-23',
        '2026-11-27',
      ]),
    ).toBe(3);
  });

  it('melewati pergantian tahun: 31 Des 2026 sampai 4 Jan 2027 (1 Jan libur) = 2', () => {
    expect(countWorkingDays('2026-12-31', '2027-01-04', ['2027-01-01'])).toBe(
      2,
    );
  });

  it('satu tahun 2026 dengan 17 libur nasional (3 jatuh di akhir pekan): 247', () => {
    const holidays2026 = [
      '2026-01-01',
      '2026-01-16',
      '2026-02-17',
      '2026-03-19',
      '2026-03-20',
      '2026-03-21',
      '2026-04-03',
      '2026-04-05',
      '2026-05-01',
      '2026-05-14',
      '2026-05-27',
      '2026-05-31',
      '2026-06-01',
      '2026-06-16',
      '2026-08-17',
      '2026-08-25',
      '2026-12-25',
    ];
    // 261 hari Senin-Jumat dikurangi 14 libur di hari kerja.
    expect(countWorkingDays('2026-01-01', '2026-12-31', holidays2026)).toBe(
      247,
    );
  });

  it('melewati 29 Februari tahun kabisat (2028)', () => {
    // Senin 28 Feb s.d. Jumat 3 Mar 2028: 5 hari kerja termasuk 29 Feb.
    expect(countWorkingDays('2028-02-28', '2028-03-03', [])).toBe(5);
  });

  it('tanggal akhir sebelum tanggal awal: 0', () => {
    expect(countWorkingDays('2026-11-30', '2026-11-23', [])).toBe(0);
  });

  it('sama dengan hitungan hari demi hari untuk semua hari awal dan panjang 0-20 hari', () => {
    const holidays = ['2026-08-17', '2026-08-25', '2026-08-29'];
    for (let startDay = 1; startDay <= 14; startDay++) {
      const start = `2026-08-${String(startDay).padStart(2, '0')}`;
      for (let length = 0; length <= 20; length++) {
        const end = toDateOnly(
          new Date(parseDateOnly(start).getTime() + length * 86_400_000),
        );
        expect([start, end, countWorkingDays(start, end, holidays)]).toEqual([
          start,
          end,
          countDayByDay(start, end, holidays),
        ]);
      }
    }
  });
});

describe('listWorkingDays', () => {
  it('Senin-Jumat tanpa libur, urut naik', () => {
    // Jumat 27 Nov sampai Rabu 2 Des 2026, libur fiktif Selasa 1 Des.
    expect(listWorkingDays('2026-11-27', '2026-12-02', ['2026-12-01'])).toEqual(
      ['2026-11-27', '2026-11-30', '2026-12-02'],
    );
  });

  it('libur akhir pekan diabaikan; start setelah end = kosong', () => {
    expect(listWorkingDays('2026-11-28', '2026-11-29', ['2026-11-28'])).toEqual(
      [],
    );
    expect(listWorkingDays('2026-11-30', '2026-11-01', [])).toEqual([]);
  });

  it('jumlahnya selalu sama dengan countWorkingDays', () => {
    const holidays = ['2026-12-25', '2026-12-31', '2027-01-01'];
    for (let offset = 0; offset < 14; offset++) {
      const start = toDateOnly(
        new Date(parseDateOnly('2026-12-20').getTime() + offset * 86_400_000),
      );
      for (const length of [0, 1, 4, 9, 30]) {
        const end = toDateOnly(
          new Date(parseDateOnly(start).getTime() + length * 86_400_000),
        );
        expect(listWorkingDays(start, end, holidays)).toHaveLength(
          countWorkingDays(start, end, holidays),
        );
      }
    }
  });
});

describe('toCalendarDate', () => {
  it('teks YYYY-MM-DD dipakai apa adanya', () => {
    expect(toCalendarDate('2026-11-26')).toBe('2026-11-26');
  });

  it('nilai kolom @db.Date (tengah malam UTC) tetap tanggal yang sama', () => {
    expect(toCalendarDate(new Date('2026-11-26T00:00:00.000Z'))).toBe(
      '2026-11-26',
    );
  });

  it('waktu dibaca dalam WIB: 26 Nov 18:00 UTC = 27 Nov 01:00 WIB', () => {
    expect(toCalendarDate(new Date('2026-11-26T18:00:00.000Z'))).toBe(
      '2026-11-27',
    );
  });

  it.each(['2026-02-30', '26-11-2026', ''])(
    'menolak tanggal tidak valid: %p',
    (value) => {
      expect(() => toCalendarDate(value)).toThrow(RangeError);
    },
  );

  it('menolak Invalid Date', () => {
    expect(() => toCalendarDate(new Date('bukan tanggal'))).toThrow(RangeError);
  });
});
