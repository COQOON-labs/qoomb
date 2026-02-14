import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

import type { IEmailTransport, SendEmailOptions } from '../interfaces/email-transport.interface';

@Injectable()
export class SmtpEmailTransport implements IEmailTransport {
  private readonly logger = new Logger(SmtpEmailTransport.name);
  private readonly transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async send(options: SendEmailOptions): Promise<void> {
    await this.transporter.sendMail({
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    this.logger.log(`Email sent via SMTP to ${options.to}: "${options.subject}"`);
  }
}
