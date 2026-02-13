import { Injectable, Logger } from '@nestjs/common';

import type { IEmailTransport, SendEmailOptions } from '../interfaces/email-transport.interface';

@Injectable()
export class ConsoleEmailTransport implements IEmailTransport {
  private readonly logger = new Logger(ConsoleEmailTransport.name);

  send(options: SendEmailOptions): Promise<void> {
    this.logger.log('─────────────────────────────────────────────────');
    this.logger.log('📧  EMAIL (console provider — not actually sent)');
    this.logger.log(`    To:      ${options.to}`);
    this.logger.log(`    From:    ${options.from}`);
    this.logger.log(`    Subject: ${options.subject}`);
    this.logger.log(`    Body:    ${options.text}`);
    this.logger.log('─────────────────────────────────────────────────');
    return Promise.resolve();
  }
}
