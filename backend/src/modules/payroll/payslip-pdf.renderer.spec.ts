import { Prisma } from '../../generated/prisma/client.js';
import {
  buildPayslipPdfContent,
  formatPeriodLabel,
  maskBankAccount,
  type PayslipPdfSource,
  renderPayslipPdf,
} from './payslip-pdf.renderer.js';

const d = (value: string) => new Prisma.Decimal(value);
const GENERATED_AT = new Date('2026-11-28T03:00:00.000Z');

const source: PayslipPdfSource = {
  employeeName: 'Raditya Pratama',
  nip: 'BRT-2024-0003',
  departmentName: 'Teknologi Informasi',
  positionName: 'Frontend Developer',
  bankName: 'BCA',
  bankAccountLast4: '8821',
  baseSalary: d('12000000'),
  fixedAllowance: d('3850000'),
  bonus: d('500000.5'),
  gross: d('16350000.5'),
  bpjsKes: d('120000'),
  bpjsJht: d('327000.01'),
  bpjsJp: d('105474'),
  pph21: d('250000'),
  otherDeductions: d('0'),
  net: d('15547526.49'),
  note: 'Bonus proyek Q4',
};

describe('PDF slip: isi', () => {
  it('kop, periode, identitas, penerimaan, potongan, take home pay, rekening 4 digit', () => {
    const content = buildPayslipPdfContent(source, '2026-11', GENERATED_AT);

    expect(content.periodLabel).toBe('November 2026');
    expect(content.title).toBe('Slip Gaji November 2026 - Raditya Pratama');
    expect(content.employee).toEqual([
      { label: 'Nama', value: 'Raditya Pratama' },
      { label: 'NIP', value: 'BRT-2024-0003' },
      { label: 'Divisi', value: 'Teknologi Informasi' },
      { label: 'Jabatan', value: 'Frontend Developer' },
    ]);
    expect(content.earnings.map((row) => row.value)).toEqual([
      'Rp 12.000.000,00',
      'Rp 3.850.000,00',
      'Rp 500.000,50',
    ]);
    expect(content.totalEarnings.value).toBe('Rp 16.350.000,50');
    // Total potongan = jumlah komponen, dihitung dengan Decimal.
    expect(content.totalDeductions.value).toBe('Rp 802.474,01');
    expect(content.takeHomePay.value).toBe('Rp 15.547.526,49');
    expect(content.bankAccount.value).toBe('BCA ****8821');
    expect(content.note).toBe('Bonus proyek Q4');
    expect(content.footer).toContain('28 November 2026');
    expect(content.footer).toContain('10.00 WIB');
  });

  it('label periode dan rekening', () => {
    expect(formatPeriodLabel('2026-01')).toBe('Januari 2026');
    expect(formatPeriodLabel('2025-12')).toBe('Desember 2025');
    expect(maskBankAccount('Mandiri', '0042')).toBe('Mandiri ****0042');
  });
});

describe('PDF slip: render', () => {
  it('menghasilkan PDF valid satu halaman A4', async () => {
    const pdf = await renderPayslipPdf(
      buildPayslipPdfContent(source, '2026-11', GENERATED_AT),
    );
    const text = pdf.toString('latin1');

    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toMatch(/\/Type \/Pages\s*\/Count 1/);
    expect(text).toContain('/MediaBox [0 0 595.28 841.89]');
    expect(pdf.length).toBeGreaterThan(1500);
  });

  it('tanpa catatan juga tetap satu halaman', async () => {
    const pdf = await renderPayslipPdf(
      buildPayslipPdfContent(
        { ...source, note: null },
        '2026-11',
        GENERATED_AT,
      ),
    );
    expect(pdf.toString('latin1')).toMatch(/\/Count 1/);
  });
});
