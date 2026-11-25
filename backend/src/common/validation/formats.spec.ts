import {
  isValidNip,
  isValidShiftWindow,
  isValidTimeHHmm,
  normalizeEmail,
  normalizeNip,
} from './formats.js';

describe('format data', () => {
  describe('NIP', () => {
    it.each(['BRT-2024-0001', 'BRT-2017-0119'])('%s valid', (nip) => {
      expect(isValidNip(nip)).toBe(true);
    });

    it.each([
      'brt-2024-0001',
      'BRT-24-0001',
      'BRT-2024-001',
      'BRT-2024-00010',
      'XYZ-2024-0001',
      ' BRT-2024-0001',
      '',
    ])('%j tidak valid', (nip) => {
      expect(isValidNip(nip)).toBe(false);
    });

    it('normalizeNip merapikan input HR sebelum divalidasi', () => {
      expect(normalizeNip('  brt-2024-0001 ')).toBe('BRT-2024-0001');
      expect(isValidNip(normalizeNip(' brt-2024-0001'))).toBe(true);
    });
  });

  it('normalizeEmail membuang spasi dan menjadikan huruf kecil', () => {
    expect(normalizeEmail('  HR@BlueRose.Test ')).toBe('hr@bluerose.test');
  });

  describe('jam HH:mm', () => {
    it.each(['00:00', '08:30', '17:30', '23:59'])('%s valid', (time) => {
      expect(isValidTimeHHmm(time)).toBe(true);
    });

    it.each(['8:30', '24:00', '12:60', '08.30', '08:30:00', ''])(
      '%j tidak valid',
      (time) => {
        expect(isValidTimeHHmm(time)).toBe(false);
      },
    );
  });

  describe('jendela shift', () => {
    it('valid jika jam pulang setelah jam masuk', () => {
      expect(isValidShiftWindow('08:30', '17:30')).toBe(true);
    });

    it('tidak valid jika jam pulang sama atau sebelum jam masuk', () => {
      expect(isValidShiftWindow('08:30', '08:30')).toBe(false);
      expect(isValidShiftWindow('22:00', '06:00')).toBe(false);
    });

    it('tidak valid jika salah satu jam salah format', () => {
      expect(isValidShiftWindow('8:30', '17:30')).toBe(false);
    });
  });
});
