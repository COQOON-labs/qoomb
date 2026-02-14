import type { BaseTranslation } from '../i18n-types';

const en: BaseTranslation = {
  email: {
    layout: {
      brand: 'QOOMB',
      fallbackLinkLabel: "If the button doesn't work, copy this link into your browser:",
      unsubscribeNote: 'You received this email because your account is registered on Qoomb.',
    },

    emailVerification: {
      subject: 'Verify your email address – Qoomb',
      title: 'Verify your email',
      greeting: 'Hello,',
      body: 'Please verify your email address to activate your Qoomb account.',
      validity: 'The link is valid for <strong>24 hours</strong>.',
      cta: 'Verify email',
      footer: 'If you did not create a Qoomb account, please ignore this email.',
    },

    passwordReset: {
      subject: 'Reset your password – Qoomb',
      title: 'Reset your password',
      greeting: 'Hello,',
      body: 'You requested a password reset for your Qoomb account.',
      validity: 'The link is valid for <strong>1 hour</strong>.',
      warning:
        'If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.',
      cta: 'Set new password',
      footer: 'If you did not request a password reset, please ignore this email.',
    },

    invitation: {
      // {{inviterName}} is a typed parameter — typesafe-i18n enforces it at call sites
      subject: '{{inviterName:string}} invited you to Qoomb',
      title: "You've been invited",
      greeting: 'Hello,',
      body: '<strong>{{inviterName:string}}</strong> has invited you to join <strong>Qoomb</strong> — the private organization platform for families and teams.',
      validity: 'The invitation is valid for <strong>7 days</strong>.',
      cta: 'Accept invitation',
      footer: 'If you did not expect this invitation, please ignore this email.',
    },
  },
};

export default en;
