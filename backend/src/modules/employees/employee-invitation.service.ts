import { Injectable, Logger } from '@nestjs/common';
import { PasswordResetService } from '../auth/password-reset.service.js';
import { escapeHtml } from '../mail/escape-html.js';
import { MailService } from '../mail/mail.service.js';
import { INVITATION_TTL_MS } from './employees.constants.js';

const INVITATION_TTL_HOURS = INVITATION_TTL_MS / 3_600_000;

export type Invitee = { email: string; fullName: string };

/** Email undangan untuk akun karyawan baru, berisi link set password. */
@Injectable()
export class EmployeeInvitationService {
  private readonly logger = new Logger(EmployeeInvitationService.name);

  constructor(
    private readonly passwordReset: PasswordResetService,
    private readonly mail: MailService,
  ) {}

  /**
   * Kirim link set password (token dari PasswordResetService.issueToken).
   * Gagal kirim tidak membatalkan pembuatan karyawan: hanya dicatat di log
   * dan mengembalikan false. Karyawan tetap bisa memakai "Lupa password".
   */
  async send(invitee: Invitee, token: string): Promise<boolean> {
    const link = this.passwordReset.passwordLink(token);
    try {
      await this.mail.send({
        to: invitee.email,
        subject: 'Undangan akun HRIS Blue Rose Tech',
        text: [
          `Halo ${invitee.fullName},`,
          '',
          'HR sudah membuatkan akun HRIS Blue Rose Tech untuk Anda.',
          `Buka link berikut dalam ${INVITATION_TTL_HOURS} jam untuk membuat password:`,
          link,
          '',
          `Setelah itu, login dengan email ${invitee.email}.`,
          'Link hanya bisa dipakai sekali. Jika kedaluwarsa, pakai "Lupa password" di halaman login.',
        ].join('\n'),
        html:
          `<p>Halo ${escapeHtml(invitee.fullName)},</p>` +
          '<p>HR sudah membuatkan akun HRIS Blue Rose Tech untuk Anda.</p>' +
          `<p><a href="${escapeHtml(link)}">Buat password</a> ` +
          `(berlaku ${INVITATION_TTL_HOURS} jam, sekali pakai).</p>` +
          `<p>Setelah itu, login dengan email ${escapeHtml(invitee.email)}. ` +
          'Jika link kedaluwarsa, pakai "Lupa password" di halaman login.</p>',
      });
      return true;
    } catch (error) {
      this.logger.error(
        { err: error, to: invitee.email },
        'Gagal mengirim email undangan karyawan',
      );
      return false;
    }
  }
}
