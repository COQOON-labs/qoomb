/**
 * Unit tests for EmailService.
 *
 * EmailService is an orchestration thin layer — each concern is delegated:
 *   - i18n:       typesafe-i18n (mocked via jest.mock)
 *   - Rendering:  EmailRendererService (mocked)
 *   - Transport:  IEmailTransport (mocked)
 *
 * Coverage targets:
 * - sendEmailVerification: correct template, correct CTA URL format, transport called
 *                          with recipient + subject
 * - sendPasswordReset:     correct template, correct CTA URL format, transport called
 * - sendInvitation:        correct template, correct CTA URL (register path),
 *                          inviterName interpolated in subject and body
 * - CTA URL construction:  uses configured APP_URL env var (no hardcoded localhost)
 */

import { EMAIL_TRANSPORT } from './interfaces/email-transport.interface';
import { type IEmailTransport } from './interfaces/email-transport.interface';
import { DEFAULT_LOCALE, EmailService } from './email.service';

// ── Mock i18n ─────────────────────────────────────────────────────────────────

jest.mock('../../i18n/i18n-util.sync', () => ({ loadAllLocales: jest.fn() }));
jest.mock('../../i18n/i18n-util', () => ({
  i18nObject: jest.fn((_locale: string) => ({
    email: {
      layout: {
        brand: jest.fn(() => 'Qoomb'),
        fallbackLinkLabel: jest.fn(() => 'Click here'),
        unsubscribeNote: jest.fn(() => 'Unsubscribe'),
      },
      emailVerification: {
        title: jest.fn(() => 'Email verification'),
        subject: jest.fn(() => 'Please verify your email'),
        greeting: jest.fn(() => 'Hello,'),
        body: jest.fn(() => 'Click the link to verify your account.'),
        validity: jest.fn(() => 'Valid for 24 hours.'),
        cta: jest.fn(() => 'Verify Email'),
        footer: jest.fn(() => 'Footer'),
      },
      passwordReset: {
        title: jest.fn(() => 'Password reset'),
        subject: jest.fn(() => 'Password reset request'),
        greeting: jest.fn(() => 'Hello,'),
        body: jest.fn(() => 'Click the link to reset your password.'),
        validity: jest.fn(() => 'Valid for 1 hour.'),
        warning: jest.fn(() => 'If you did not request this, ignore it.'),
        cta: jest.fn(() => 'Reset Password'),
        footer: jest.fn(() => 'Footer'),
      },
      invitation: {
        title: jest.fn(() => 'Invitation'),
        subject: jest.fn(
          ({ inviterName }: { inviterName: string }) => `${inviterName} invited you`
        ),
        greeting: jest.fn(() => 'Hello,'),
        body: jest.fn(
          ({ inviterName }: { inviterName: string }) => `${inviterName} has invited you`
        ),
        validity: jest.fn(() => 'Valid for 7 days.'),
        cta: jest.fn(() => 'Join'),
        footer: jest.fn(() => 'Footer'),
      },
    },
  })),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockRenderer = {
  render: jest.fn<string, [string, Record<string, unknown>]>(() => '<html>email</html>'),
};

const mockTransport: IEmailTransport = {
  send: jest.fn(),
};

function buildService(appUrl = 'https://app.qoomb.com'): EmailService {
  // EmailService reads process.env in constructor — set before instantiation
  process.env.APP_URL = appUrl;
  process.env.EMAIL_FROM = 'noreply@qoomb.app';

  // Use Reflect to bypass NestJS DI — inject mocks directly
  const svc = new (EmailService as new (
    renderer: unknown,
    transport: IEmailTransport
  ) => EmailService)(mockRenderer, mockTransport);

  return svc;
}

function resetMocks() {
  jest.clearAllMocks();
  mockRenderer.render.mockReturnValue('<html>email</html>');
  (mockTransport.send as jest.Mock).mockResolvedValue(undefined);
}

const TOKEN = 'test-token-abc';
const TO = 'user@example.com';
const APP_URL = 'https://app.qoomb.com';

// ─────────────────────────────────────────────────────────────────────────────

describe('EmailService', () => {
  let svc: EmailService;

  beforeEach(() => {
    resetMocks();
    svc = buildService(APP_URL);
  });

  afterAll(() => {
    delete process.env.APP_URL;
    delete process.env.EMAIL_FROM;
  });

  // ── sendEmailVerification ─────────────────────────────────────────────────

  describe('sendEmailVerification', () => {
    it('renders the email-verification template', async () => {
      await svc.sendEmailVerification(TO, TOKEN);

      expect(mockRenderer.render).toHaveBeenCalledWith('email-verification', expect.any(Object));
    });

    it('constructs CTA URL as APP_URL/verify-email?token=TOKEN', async () => {
      await svc.sendEmailVerification(TO, TOKEN);

      const context = mockRenderer.render.mock.calls[0][1] as unknown as Record<string, string>;
      expect(context.ctaUrl).toBe(`${APP_URL}/verify-email?token=${TOKEN}`);
    });

    it('sends to the correct recipient', async () => {
      await svc.sendEmailVerification(TO, TOKEN);

      const sendCall = (mockTransport.send as jest.Mock).mock.calls[0][0];
      expect(sendCall.to).toBe(TO);
    });

    it('includes the CTA URL in the plain-text fallback', async () => {
      await svc.sendEmailVerification(TO, TOKEN);

      const sendCall = (mockTransport.send as jest.Mock).mock.calls[0][0];
      expect(sendCall.text).toContain(`${APP_URL}/verify-email?token=${TOKEN}`);
    });

    it('uses DEFAULT_LOCALE when no locale provided', async () => {
      await svc.sendEmailVerification(TO, TOKEN);

      // i18nObject should be called with the default locale
      const { i18nObject } = jest.requireMock('../../i18n/i18n-util') as {
        i18nObject: jest.Mock;
      };
      expect(i18nObject).toHaveBeenCalledWith(DEFAULT_LOCALE);
    });
  });

  // ── sendPasswordReset ─────────────────────────────────────────────────────

  describe('sendPasswordReset', () => {
    it('renders the password-reset template', async () => {
      await svc.sendPasswordReset(TO, TOKEN);

      expect(mockRenderer.render).toHaveBeenCalledWith('password-reset', expect.any(Object));
    });

    it('constructs CTA URL as APP_URL/reset-password?token=TOKEN', async () => {
      await svc.sendPasswordReset(TO, TOKEN);

      const context = mockRenderer.render.mock.calls[0][1] as unknown as Record<string, string>;
      expect(context.ctaUrl).toBe(`${APP_URL}/reset-password?token=${TOKEN}`);
    });

    it('sends to the correct recipient', async () => {
      await svc.sendPasswordReset(TO, TOKEN);

      const sendCall = (mockTransport.send as jest.Mock).mock.calls[0][0];
      expect(sendCall.to).toBe(TO);
    });

    it('includes the CTA URL in the plain-text fallback', async () => {
      await svc.sendPasswordReset(TO, TOKEN);

      const sendCall = (mockTransport.send as jest.Mock).mock.calls[0][0];
      expect(sendCall.text).toContain(`${APP_URL}/reset-password?token=${TOKEN}`);
    });
  });

  // ── sendInvitation ────────────────────────────────────────────────────────

  describe('sendInvitation', () => {
    const INVITER = 'Alice Müller';

    it('renders the invitation template', async () => {
      await svc.sendInvitation(TO, INVITER, TOKEN);

      expect(mockRenderer.render).toHaveBeenCalledWith('invitation', expect.any(Object));
    });

    it('constructs CTA URL as APP_URL/register?token=TOKEN', async () => {
      await svc.sendInvitation(TO, INVITER, TOKEN);

      const context = mockRenderer.render.mock.calls[0][1] as unknown as Record<string, string>;
      expect(context.ctaUrl).toBe(`${APP_URL}/register?token=${TOKEN}`);
    });

    it('passes inviterName to the i18n subject function', async () => {
      await svc.sendInvitation(TO, INVITER, TOKEN);

      const sendCall = (mockTransport.send as jest.Mock).mock.calls[0][0];
      // Subject mock: `${inviterName} invited you`
      expect(sendCall.subject).toContain(INVITER);
    });

    it('includes inviterName in the plain-text fallback body', async () => {
      await svc.sendInvitation(TO, INVITER, TOKEN);

      const sendCall = (mockTransport.send as jest.Mock).mock.calls[0][0];
      // text = body({ inviterName }) + space + ctaUrl
      expect(sendCall.text).toContain(INVITER);
    });

    it('sends to the correct recipient', async () => {
      await svc.sendInvitation(TO, INVITER, TOKEN);

      const sendCall = (mockTransport.send as jest.Mock).mock.calls[0][0];
      expect(sendCall.to).toBe(TO);
    });
  });

  // ── CTA URL construction ──────────────────────────────────────────────────

  describe('CTA URL construction', () => {
    it('uses the configured APP_URL, not a hardcoded localhost', async () => {
      const customUrl = 'https://staging.qoomb.example.com';
      process.env.APP_URL = customUrl;
      const stagingSvc = buildService(customUrl);

      await stagingSvc.sendEmailVerification(TO, TOKEN);

      const context = mockRenderer.render.mock.calls[0][1] as unknown as Record<string, string>;
      expect(context.ctaUrl).toContain(customUrl);
      expect(context.ctaUrl).not.toContain('localhost');
    });
  });
});
