import { Module } from '@nestjs/common';

import { EmailRendererService } from './email-renderer.service';
import { EmailService } from './email.service';
import { EMAIL_TRANSPORT } from './interfaces/email-transport.interface';
import { ConsoleEmailTransport } from './transports/console.transport';
import { ResendEmailTransport } from './transports/resend.transport';
import { SmtpEmailTransport } from './transports/smtp.transport';

/**
 * Selects the email transport based on the EMAIL_PROVIDER environment variable.
 * Adding a new provider: create a new transport class + add a case here.
 */
function createTransport() {
  const provider = process.env.EMAIL_PROVIDER ?? 'console';

  switch (provider) {
    case 'smtp':
      return new SmtpEmailTransport();
    case 'resend':
      return new ResendEmailTransport();
    case 'console':
    default:
      return new ConsoleEmailTransport();
  }
}

@Module({
  providers: [
    {
      provide: EMAIL_TRANSPORT,
      useFactory: createTransport,
    },
    EmailRendererService,
    EmailService,
  ],
  exports: [EmailService],
})
export class EmailModule {}
