/**
 * Unit tests for SystemConfigService.
 *
 * This service is the single source of truth for operator feature flags
 * (ALLOW_OPEN_REGISTRATION, ALLOW_FORGOT_PASSWORD, ALLOW_PASSKEYS).
 * No other module should call getEnv() for these flags directly.
 *
 * Coverage targets:
 * - getConfig():               returns a correct snapshot of all three flags
 * - isOpenRegistrationAllowed: reflects ALLOW_OPEN_REGISTRATION
 * - isForgotPasswordAllowed:   reflects ALLOW_FORGOT_PASSWORD
 * - isPasskeysAllowed:         reflects ALLOW_PASSKEYS
 * - Each flag is independent — one being true does not influence others
 */

import { SystemConfigService } from './system-config.service';

// ── Mock getEnv ───────────────────────────────────────────────────────────────

jest.mock('../../config/env.validation');

import { getEnv } from '../../config/env.validation';

const mockGetEnv = getEnv as jest.MockedFunction<typeof getEnv>;

function setFlags(flags: {
  ALLOW_OPEN_REGISTRATION: boolean;
  ALLOW_FORGOT_PASSWORD: boolean;
  ALLOW_PASSKEYS: boolean;
}): void {
  mockGetEnv.mockReturnValue(flags as ReturnType<typeof getEnv>);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('SystemConfigService', () => {
  let svc: SystemConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new SystemConfigService();
    // Default: all flags enabled
    setFlags({
      ALLOW_OPEN_REGISTRATION: true,
      ALLOW_FORGOT_PASSWORD: true,
      ALLOW_PASSKEYS: true,
    });
  });

  // ── getConfig ─────────────────────────────────────────────────────────────

  describe('getConfig', () => {
    it('returns a snapshot with all three flags when all are true', () => {
      const config = svc.getConfig();

      expect(config).toEqual({
        allowOpenRegistration: true,
        allowForgotPassword: true,
        allowPasskeys: true,
      });
    });

    it('returns a snapshot with all three flags when all are false', () => {
      setFlags({
        ALLOW_OPEN_REGISTRATION: false,
        ALLOW_FORGOT_PASSWORD: false,
        ALLOW_PASSKEYS: false,
      });

      const config = svc.getConfig();

      expect(config).toEqual({
        allowOpenRegistration: false,
        allowForgotPassword: false,
        allowPasskeys: false,
      });
    });

    it('maps env var names to camelCase output keys correctly', () => {
      setFlags({
        ALLOW_OPEN_REGISTRATION: true,
        ALLOW_FORGOT_PASSWORD: false,
        ALLOW_PASSKEYS: true,
      });

      const config = svc.getConfig();

      // Verify exact key names — a rename would break the tRPC contract
      expect(Object.keys(config).sort()).toEqual([
        'allowForgotPassword',
        'allowOpenRegistration',
        'allowPasskeys',
      ]);
    });
  });

  // ── isOpenRegistrationAllowed ─────────────────────────────────────────────

  describe('isOpenRegistrationAllowed', () => {
    it('returns true when ALLOW_OPEN_REGISTRATION is true', () => {
      setFlags({
        ALLOW_OPEN_REGISTRATION: true,
        ALLOW_FORGOT_PASSWORD: false,
        ALLOW_PASSKEYS: false,
      });

      expect(svc.isOpenRegistrationAllowed()).toBe(true);
    });

    it('returns false when ALLOW_OPEN_REGISTRATION is false', () => {
      setFlags({
        ALLOW_OPEN_REGISTRATION: false,
        ALLOW_FORGOT_PASSWORD: true,
        ALLOW_PASSKEYS: true,
      });

      expect(svc.isOpenRegistrationAllowed()).toBe(false);
    });
  });

  // ── isForgotPasswordAllowed ───────────────────────────────────────────────

  describe('isForgotPasswordAllowed', () => {
    it('returns true when ALLOW_FORGOT_PASSWORD is true', () => {
      setFlags({
        ALLOW_OPEN_REGISTRATION: false,
        ALLOW_FORGOT_PASSWORD: true,
        ALLOW_PASSKEYS: false,
      });

      expect(svc.isForgotPasswordAllowed()).toBe(true);
    });

    it('returns false when ALLOW_FORGOT_PASSWORD is false', () => {
      setFlags({
        ALLOW_OPEN_REGISTRATION: true,
        ALLOW_FORGOT_PASSWORD: false,
        ALLOW_PASSKEYS: true,
      });

      expect(svc.isForgotPasswordAllowed()).toBe(false);
    });
  });

  // ── isPasskeysAllowed ─────────────────────────────────────────────────────

  describe('isPasskeysAllowed', () => {
    it('returns true when ALLOW_PASSKEYS is true', () => {
      setFlags({
        ALLOW_OPEN_REGISTRATION: false,
        ALLOW_FORGOT_PASSWORD: false,
        ALLOW_PASSKEYS: true,
      });

      expect(svc.isPasskeysAllowed()).toBe(true);
    });

    it('returns false when ALLOW_PASSKEYS is false', () => {
      setFlags({
        ALLOW_OPEN_REGISTRATION: true,
        ALLOW_FORGOT_PASSWORD: true,
        ALLOW_PASSKEYS: false,
      });

      expect(svc.isPasskeysAllowed()).toBe(false);
    });
  });

  // ── Flag independence ─────────────────────────────────────────────────────

  describe('flag independence', () => {
    it('each flag can be toggled independently without affecting the others', () => {
      // Registration off, rest on
      setFlags({
        ALLOW_OPEN_REGISTRATION: false,
        ALLOW_FORGOT_PASSWORD: true,
        ALLOW_PASSKEYS: true,
      });
      expect(svc.isOpenRegistrationAllowed()).toBe(false);
      expect(svc.isForgotPasswordAllowed()).toBe(true);
      expect(svc.isPasskeysAllowed()).toBe(true);

      // ForgotPassword off, rest on
      setFlags({
        ALLOW_OPEN_REGISTRATION: true,
        ALLOW_FORGOT_PASSWORD: false,
        ALLOW_PASSKEYS: true,
      });
      expect(svc.isOpenRegistrationAllowed()).toBe(true);
      expect(svc.isForgotPasswordAllowed()).toBe(false);
      expect(svc.isPasskeysAllowed()).toBe(true);

      // Passkeys off, rest on
      setFlags({
        ALLOW_OPEN_REGISTRATION: true,
        ALLOW_FORGOT_PASSWORD: true,
        ALLOW_PASSKEYS: false,
      });
      expect(svc.isOpenRegistrationAllowed()).toBe(true);
      expect(svc.isForgotPasswordAllowed()).toBe(true);
      expect(svc.isPasskeysAllowed()).toBe(false);
    });
  });
});
