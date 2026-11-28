import { Prisma } from '../../generated/prisma/client.js';
import {
  formatMoney,
  formatRupiah,
  formatRate,
  isMoneyString,
  isRateString,
  parseMoney,
  parseRate,
  sumMoney,
} from './money.js';

describe('money', () => {
  it.each(['0', '0.5', '8500000', '8500000.00', '9999999999999.99'])(
    'uang valid: %s',
    (value) => {
      expect(isMoneyString(value)).toBe(true);
      expect(parseMoney(value).toFixed(2)).toBe(
        new Prisma.Decimal(value).toFixed(2),
      );
    },
  );

  it.each(['-1', '01', '1.234', '1e6', '10000000000000', ' 100', '1,5', ''])(
    'uang tidak valid: %j',
    (value) => {
      expect(isMoneyString(value)).toBe(false);
      expect(() => parseMoney(value)).toThrow(RangeError);
    },
  );

  it('number (float JSON) bukan uang', () => {
    expect(isMoneyString(8500000)).toBe(false);
  });

  it.each(['0', '0.01', '0.0024', '1', '1.0000'])(
    'tarif valid: %s',
    (value) => {
      expect(isRateString(value)).toBe(true);
    },
  );

  it.each(['1.01', '0.00001', '2', '-0.01', '.5'])(
    'tarif tidak valid: %s',
    (value) => {
      expect(isRateString(value)).toBe(false);
      expect(() => parseRate(value)).toThrow(RangeError);
    },
  );

  it('format dan penjumlahan tanpa kehilangan presisi', () => {
    expect(formatMoney(parseMoney('0.1').plus(parseMoney('0.2')))).toBe('0.30');
    expect(formatRate(parseRate('0.01'))).toBe('0.0100');
    expect(
      formatMoney(
        sumMoney([parseMoney('9999999999999.99'), parseMoney('0.01')]),
      ),
    ).toBe('10000000000000.00');
    expect(formatMoney(sumMoney([]))).toBe('0.00');
  });
});

describe('formatRupiah', () => {
  it('titik ribuan, koma desimal, selalu 2 desimal; dari Decimal tanpa float', () => {
    expect(formatRupiah(parseMoney('8500000'))).toBe('Rp 8.500.000,00');
    expect(formatRupiah(parseMoney('105474.5'))).toBe('Rp 105.474,50');
    expect(formatRupiah(parseMoney('0'))).toBe('Rp 0,00');
    expect(formatRupiah(parseMoney('999'))).toBe('Rp 999,00');
    expect(formatRupiah(parseMoney('9999999999999.99'))).toBe(
      'Rp 9.999.999.999.999,99',
    );
    expect(formatRupiah(parseMoney('0.1').plus(parseMoney('0.2')))).toBe(
      'Rp 0,30',
    );
    expect(formatRupiah(parseMoney('1500').negated())).toBe('-Rp 1.500,00');
  });
});
