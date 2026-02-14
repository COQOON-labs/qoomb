import { Inject, Injectable, OnModuleInit } from '@nestjs/common';

import type { Locales } from '../../i18n/i18n-types';
import { i18nObject } from '../../i18n/i18n-util';
import { loadAllLocales } from '../../i18n/i18n-util.sync';

import { EmailRendererService } from './email-renderer.service';
import { EMAIL_TRANSPORT, type IEmailTransport } from './interfaces/email-transport.interface';

export type SupportedLocale = Locales;
export const DEFAULT_LOCALE: SupportedLocale = 'en';

/**
 * Orchestrates email delivery: i18n translations → template rendering → transport.
 *
 * This service is intentionally thin — each concern is delegated:
 *   - i18n:       typesafe-i18n (src/i18n/<locale>/index.ts)
 *   - Rendering:  EmailRendererService (Handlebars templates)
 *   - Transport:  IEmailTransport (injected — console | smtp | resend)
 */
@Injectable()
export class EmailService implements OnModuleInit {
  private readonly from: string;
  private readonly appUrl: string;

  constructor(
    private readonly renderer: EmailRendererService,
    @Inject(EMAIL_TRANSPORT) private readonly transport: IEmailTransport
  ) {
    this.from = process.env.EMAIL_FROM ?? process.env.SMTP_FROM ?? 'noreply@qoomb.app';
    this.appUrl = process.env.APP_URL ?? 'http://localhost:5173';
  }

  onModuleInit(): void {
    loadAllLocales();
  }

  async sendEmailVerification(
    to: string,
    token: string,
    locale: SupportedLocale = DEFAULT_LOCALE
  ): Promise<void> {
    const LL = i18nObject(locale).email;
    const ctaUrl = `${this.appUrl}/verify-email?token=${token}`;

    const html = this.renderer.render('email-verification', {
      lang: locale,
      brand: LL.layout.brand(),
      fallbackLinkLabel: LL.layout.fallbackLinkLabel(),
      unsubscribeNote: LL.layout.unsubscribeNote(),
      title: LL.emailVerification.title(),
      greeting: LL.emailVerification.greeting(),
      body: LL.emailVerification.body(),
      validity: LL.emailVerification.validity(),
      cta: LL.emailVerification.cta(),
      footer: LL.emailVerification.footer(),
      ctaUrl,
    });

    await this.transport.send({
      to,
      from: this.from,
      subject: LL.emailVerification.subject(),
      html,
      text: `${LL.emailVerification.body()} ${ctaUrl}`,
    });
  }

  async sendPasswordReset(
    to: string,
    token: string,
    locale: SupportedLocale = DEFAULT_LOCALE
  ): Promise<void> {
    const LL = i18nObject(locale).email;
    const ctaUrl = `${this.appUrl}/reset-password?token=${token}`;

    const html = this.renderer.render('password-reset', {
      lang: locale,
      brand: LL.layout.brand(),
      fallbackLinkLabel: LL.layout.fallbackLinkLabel(),
      unsubscribeNote: LL.layout.unsubscribeNote(),
      title: LL.passwordReset.title(),
      greeting: LL.passwordReset.greeting(),
      body: LL.passwordReset.body(),
      validity: LL.passwordReset.validity(),
      warning: LL.passwordReset.warning(),
      cta: LL.passwordReset.cta(),
      footer: LL.passwordReset.footer(),
      ctaUrl,
    });

    await this.transport.send({
      to,
      from: this.from,
      subject: LL.passwordReset.subject(),
      html,
      text: `${LL.passwordReset.body()} ${ctaUrl}`,
    });
  }

  async sendInvitation(
    to: string,
    inviterName: string,
    token: string,
    locale: SupportedLocale = DEFAULT_LOCALE
  ): Promise<void> {
    const LL = i18nObject(locale).email;
    const ctaUrl = `${this.appUrl}/register?token=${token}`;

    const html = this.renderer.render('invitation', {
      lang: locale,
      brand: LL.layout.brand(),
      fallbackLinkLabel: LL.layout.fallbackLinkLabel(),
      unsubscribeNote: LL.layout.unsubscribeNote(),
      title: LL.invitation.title(),
      greeting: LL.invitation.greeting(),
      body: LL.invitation.body({ inviterName }),
      validity: LL.invitation.validity(),
      cta: LL.invitation.cta(),
      footer: LL.invitation.footer(),
      ctaUrl,
    });

    await this.transport.send({
      to,
      from: this.from,
      subject: LL.invitation.subject({ inviterName }),
      html,
      text: `${LL.invitation.body({ inviterName })} ${ctaUrl}`,
    });
  }
}
