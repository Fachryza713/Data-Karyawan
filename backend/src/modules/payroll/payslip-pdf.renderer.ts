import PDFDocument from 'pdfkit';
import { formatRupiah } from '../../common/money/money.js';
import { APP_TIME_ZONE } from '../../common/validation/date-only.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const COMPANY_NAME = 'Blue Rose Tech';

/** Snapshot PayrollItem yang dicetak ke PDF (tidak membaca data gaji terkini). */
export type PayslipPdfSource = {
  employeeName: string;
  nip: string;
  departmentName: string;
  positionName: string;
  bankName: string;
  bankAccountLast4: string;
  baseSalary: Prisma.Decimal;
  fixedAllowance: Prisma.Decimal;
  bonus: Prisma.Decimal;
  gross: Prisma.Decimal;
  bpjsKes: Prisma.Decimal;
  bpjsJht: Prisma.Decimal;
  bpjsJp: Prisma.Decimal;
  pph21: Prisma.Decimal;
  otherDeductions: Prisma.Decimal;
  net: Prisma.Decimal;
  note: string | null;
};

export type PdfRow = { label: string; value: string };

/** Isi PDF yang sudah diformat; layout di renderPayslipPdf. */
export type PayslipPdfContent = {
  title: string;
  periodLabel: string;
  employee: PdfRow[];
  earnings: PdfRow[];
  totalEarnings: PdfRow;
  deductions: PdfRow[];
  totalDeductions: PdfRow;
  takeHomePay: PdfRow;
  bankAccount: PdfRow;
  note: string | null;
  generatedAt: Date;
  footer: string;
};

/** "2026-11" -> "November 2026". */
export function formatPeriodLabel(period: string): string {
  const [year, month] = period.split('-');
  return new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(
    new Date(
      Date.UTC(Number.parseInt(year, 10), Number.parseInt(month, 10) - 1),
    ),
  );
}

/** Rekening tujuan tanpa nomor lengkap: "BCA ****8821". */
export function maskBankAccount(bankName: string, last4: string): string {
  return `${bankName} ****${last4}`;
}

function formatGeneratedAt(date: Date): string {
  const text = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: APP_TIME_ZONE,
  }).format(date);
  return `${text} WIB`;
}

/** Susun isi slip dari snapshot. Total potongan = jumlah komponen potongan. */
export function buildPayslipPdfContent(
  item: PayslipPdfSource,
  period: string,
  generatedAt: Date,
): PayslipPdfContent {
  const deductions = item.bpjsKes
    .plus(item.bpjsJht)
    .plus(item.bpjsJp)
    .plus(item.pph21)
    .plus(item.otherDeductions);
  const periodLabel = formatPeriodLabel(period);
  return {
    title: `Slip Gaji ${periodLabel} - ${item.employeeName}`,
    periodLabel,
    employee: [
      { label: 'Nama', value: item.employeeName },
      { label: 'NIP', value: item.nip },
      { label: 'Divisi', value: item.departmentName },
      { label: 'Jabatan', value: item.positionName },
    ],
    earnings: [
      { label: 'Gaji pokok', value: formatRupiah(item.baseSalary) },
      { label: 'Tunjangan tetap', value: formatRupiah(item.fixedAllowance) },
      { label: 'Bonus', value: formatRupiah(item.bonus) },
    ],
    totalEarnings: {
      label: 'Total penerimaan (bruto)',
      value: formatRupiah(item.gross),
    },
    deductions: [
      { label: 'BPJS Kesehatan', value: formatRupiah(item.bpjsKes) },
      { label: 'BPJS JHT', value: formatRupiah(item.bpjsJht) },
      { label: 'BPJS Jaminan Pensiun', value: formatRupiah(item.bpjsJp) },
      { label: 'PPh 21', value: formatRupiah(item.pph21) },
      { label: 'Potongan lain', value: formatRupiah(item.otherDeductions) },
    ],
    totalDeductions: {
      label: 'Total potongan',
      value: formatRupiah(deductions),
    },
    takeHomePay: { label: 'Take home pay', value: formatRupiah(item.net) },
    bankAccount: {
      label: 'Rekening tujuan',
      value: maskBankAccount(item.bankName, item.bankAccountLast4),
    },
    note: item.note,
    generatedAt,
    footer:
      `Dokumen ini dibuat otomatis oleh HRIS ${COMPANY_NAME} pada ` +
      `${formatGeneratedAt(generatedAt)} dan sah tanpa tanda tangan. ` +
      'Bersifat rahasia, hanya untuk karyawan yang bersangkutan.',
  };
}

// ---------------------------------------------------------------------------
// Layout (A4, font standar PDF, tanpa file font tambahan)
// ---------------------------------------------------------------------------

const MARGIN = 50;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BRAND = '#1e3a8a';
const MUTED = '#6b7280';
const TEXT = '#111827';
const RULE = '#d1d5db';

type Doc = PDFKit.PDFDocument;

function rule(doc: Doc, color = RULE, width = 0.75): void {
  const y = doc.y;
  doc
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + CONTENT_WIDTH, y)
    .lineWidth(width)
    .strokeColor(color)
    .stroke();
  doc.y = y + 6;
}

function heading(doc: Doc, text: string): void {
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND).text(text, MARGIN);
  doc.moveDown(0.2);
  rule(doc);
}

/** Label kiri, nilai kanan (uang) atau setelah titik dua (identitas). */
function row(
  doc: Doc,
  { label, value }: PdfRow,
  opts: { bold?: boolean; align?: 'right' | 'left' } = {},
): void {
  const labelWidth = opts.align === 'left' ? 90 : CONTENT_WIDTH * 0.6;
  const y = doc.y;
  doc
    .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(10)
    .fillColor(TEXT);
  doc.text(label, MARGIN, y, { width: labelWidth });
  const labelBottom = doc.y;
  doc.text(
    opts.align === 'left' ? `: ${value}` : value,
    MARGIN + labelWidth,
    y,
    {
      width: CONTENT_WIDTH - labelWidth,
      align: opts.align ?? 'right',
    },
  );
  doc.y = Math.max(labelBottom, doc.y) + 3;
}

/** PDF slip satu halaman A4. */
export function renderPayslipPdf(content: PayslipPdfContent): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    info: {
      Title: content.title,
      Author: COMPANY_NAME,
      Subject: `Slip gaji ${content.periodLabel}`,
      CreationDate: content.generatedAt,
    },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // Kop
  doc
    .font('Helvetica-Bold')
    .fontSize(20)
    .fillColor(BRAND)
    .text(COMPANY_NAME, MARGIN, MARGIN);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text('Human Resource Information System');
  doc.moveDown(0.5);
  rule(doc, BRAND, 1.5);

  doc.moveDown(0.5);
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor(TEXT)
    .text('SLIP GAJI', MARGIN, doc.y, {
      width: CONTENT_WIDTH,
      align: 'center',
    });
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(MUTED)
    .text(`Periode ${content.periodLabel}`, {
      width: CONTENT_WIDTH,
      align: 'center',
    });

  heading(doc, 'Data karyawan');
  for (const item of content.employee) {
    row(doc, item, { align: 'left' });
  }

  heading(doc, 'Penerimaan');
  for (const item of content.earnings) {
    row(doc, item);
  }
  rule(doc);
  row(doc, content.totalEarnings, { bold: true });

  heading(doc, 'Potongan');
  for (const item of content.deductions) {
    row(doc, item);
  }
  rule(doc);
  row(doc, content.totalDeductions, { bold: true });

  // Take home pay disorot.
  doc.moveDown(0.8);
  const boxY = doc.y;
  doc.rect(MARGIN, boxY, CONTENT_WIDTH, 30).fill('#eff6ff');
  doc.y = boxY + 9;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(BRAND);
  doc.text(content.takeHomePay.label.toUpperCase(), MARGIN + 10, doc.y, {
    width: CONTENT_WIDTH / 2,
  });
  doc.text(content.takeHomePay.value, MARGIN + CONTENT_WIDTH / 2, boxY + 9, {
    width: CONTENT_WIDTH / 2 - 10,
    align: 'right',
  });
  doc.y = boxY + 38;

  row(doc, content.bankAccount, { align: 'left' });

  if (content.note) {
    heading(doc, 'Catatan');
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(TEXT)
      .text(content.note, MARGIN, doc.y, { width: CONTENT_WIDTH });
  }

  doc.moveDown(2);
  rule(doc);
  doc
    .font('Helvetica-Oblique')
    .fontSize(8)
    .fillColor(MUTED)
    .text(content.footer, MARGIN, doc.y, { width: CONTENT_WIDTH });

  doc.end();
  return done;
}
