import { escapeHtml } from '../mail/escape-html.js';
import type { MailMessage } from '../mail/mail.service.js';
import { PAYSLIP_APP_PATH } from './payroll.constants.js';
import { COMPANY_NAME, formatPeriodLabel } from './payslip-pdf.renderer.js';

/** Link halaman slip di portal karyawan (path FRONTEND_URL dipertahankan). */
export function payslipAppLink(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, '')}${PAYSLIP_APP_PATH}`;
}

/**
 * Email "Slip gaji <bulan> sudah terbit". Isinya hanya link ke aplikasi:
 * slip (data gaji) tidak pernah dilampirkan, jadi tetap di balik login.
 */
export function payslipReadyMail(input: {
  to: string;
  name: string;
  period: string;
  appUrl: string;
}): MailMessage {
  const label = formatPeriodLabel(input.period);
  const link = payslipAppLink(input.appUrl);
  return {
    to: input.to,
    subject: `Slip gaji ${label} sudah terbit`,
    text:
      `Halo ${input.name},\n\n` +
      `Slip gaji ${label} sudah terbit. Lihat dan unduh PDF-nya di aplikasi HRIS:\n` +
      `${link}\n\n` +
      'Demi keamanan, slip tidak dilampirkan di email ini.\n\n' +
      `HRIS ${COMPANY_NAME}`,
    html:
      `<p>Halo ${escapeHtml(input.name)},</p>` +
      `<p>Slip gaji ${escapeHtml(label)} sudah terbit. Lihat dan unduh PDF-nya di aplikasi HRIS.</p>` +
      `<p><a href="${escapeHtml(link)}">Buka slip gaji</a></p>` +
      '<p>Demi keamanan, slip tidak dilampirkan di email ini.</p>' +
      `<p>HRIS ${escapeHtml(COMPANY_NAME)}</p>`,
  };
}
