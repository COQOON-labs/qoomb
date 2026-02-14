import { Injectable, Logger } from '@nestjs/common';

import type { IEmailTransport, SendEmailOptions } from '../interfaces/email-transport.interface';

@Injectable()
export class ResendEmailTransport implements IEmailTransport {
  private readonly logger = new Logger(ResendEmailTransport.name);
  private readonly apiKey: string;

  constructor() {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error('RESEND_API_KEY must be set when EMAIL_PROVIDER=resend');
    }
    this.apiKey = key;
  }

  async send(options: SendEmailOptions): Promise<void> {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins -- requires Node 18+
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: options.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });

    if (!response.ok) {
      const body: unknown = await response.json();
      throw new Error(`Resend API error ${response.status}: ${JSON.stringify(body)}`);
    }

    this.logger.log(`Email sent via Resend to ${options.to}: "${options.subject}"`);
  }
}
