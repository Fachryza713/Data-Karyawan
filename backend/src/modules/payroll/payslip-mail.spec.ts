import { payslipAppLink, payslipReadyMail } from './payslip-mail.js';

describe('email slip terbit', () => {
  it('subjek "Slip gaji <bulan> sudah terbit", link ke aplikasi, tanpa lampiran', () => {
    const mail = payslipReadyMail({
      to: 'raditya@bluerose.test',
      name: 'Raditya "Radit" <Pratama>',
      period: '2026-11',
      appUrl: 'https://hris.bluerose.test/',
    });

    expect(mail.to).toBe('raditya@bluerose.test');
    expect(mail.subject).toBe('Slip gaji November 2026 sudah terbit');
    expect(mail.text).toContain('https://hris.bluerose.test/app/gaji');
    expect(mail.html).toContain(
      '<a href="https://hris.bluerose.test/app/gaji">Buka slip gaji</a>',
    );
    // Nama di-escape di HTML.
    expect(mail.html).toContain('Raditya &quot;Radit&quot; &lt;Pratama&gt;');
    expect(mail).not.toHaveProperty('attachments');
    // Tidak ada angka gaji di email.
    expect(`${mail.text}${mail.html}`).not.toMatch(/Rp\s?\d/);
  });

  it('path FRONTEND_URL dipertahankan', () => {
    expect(payslipAppLink('http://localhost:5173')).toBe(
      'http://localhost:5173/app/gaji',
    );
    expect(payslipAppLink('https://bluerose.test/hris//')).toBe(
      'https://bluerose.test/hris/app/gaji',
    );
  });
});
