import { Prisma } from '../../generated/prisma/client.js';
import { diffSnapshots, sanitizeForAudit } from './audit-sanitize.js';

describe('sanitizeForAudit', () => {
  it('membuang password, hash, dan token di semua tingkat objek', () => {
    const result = sanitizeForAudit({
      email: 'raditya@bluerose.test',
      passwordHash: '$argon2id$v=19$...',
      user: {
        password: 'rahasia',
        tokenHash: 'abc',
        refreshToken: 'r1',
        accessToken: 'a1',
        JWT_SECRET: 's',
        role: 'EMPLOYEE',
      },
      sessions: [{ token: 't', ip: '10.0.0.1' }],
    });

    expect(result).toEqual({
      email: 'raditya@bluerose.test',
      user: { role: 'EMPLOYEE' },
      sessions: [{ ip: '10.0.0.1' }],
    });
    expect(JSON.stringify(result)).not.toMatch(/rahasia|argon2|abc|r1|a1/);
  });

  it('Date menjadi ISO string, Decimal menjadi teks (presisi uang aman)', () => {
    expect(
      sanitizeForAudit({
        deletedAt: new Date('2026-11-26T03:00:00.000Z'),
        baseSalary: new Prisma.Decimal('12500000.50'),
        phone: null,
        skipped: undefined,
      }),
    ).toEqual({
      deletedAt: '2026-11-26T03:00:00.000Z',
      baseSalary: '12500000.5',
      phone: null,
    });
  });

  it('null/undefined di tingkat atas menjadi undefined (kolom NULL)', () => {
    expect(sanitizeForAudit(null)).toBeUndefined();
    expect(sanitizeForAudit(undefined)).toBeUndefined();
  });
});

describe('diffSnapshots', () => {
  it('hanya field yang berubah', () => {
    expect(
      diffSnapshots(
        { fullName: 'Raditya', phone: '0812', departmentId: 'd1' },
        { fullName: 'Raditya P.', phone: null, departmentId: 'd1' },
      ),
    ).toEqual({
      before: { fullName: 'Raditya', phone: '0812' },
      after: { fullName: 'Raditya P.', phone: null },
    });
  });

  it('null jika tidak ada perubahan (Date dibandingkan nilainya)', () => {
    expect(
      diffSnapshots(
        { at: new Date('2026-01-01T00:00:00Z'), name: 'A' },
        { at: new Date('2026-01-01T00:00:00Z'), name: 'A' },
      ),
    ).toBeNull();
  });
});
