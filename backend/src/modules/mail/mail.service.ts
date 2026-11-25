import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../../config/env.validation.js';

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/**
 * Kirim email lewat SMTP (Mailpit di lokal, UI http://localhost:8025).
 * Koneksi dibuka saat mengirim, jadi aplikasi tetap bisa start tanpa SMTP.
 */
@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    const port = config.get('SMTP_PORT', { infer: true });
    this.transporter = createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port,
      secure: port === 465,
    });
    this.from = config.get('MAIL_FROM', { infer: true });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}
