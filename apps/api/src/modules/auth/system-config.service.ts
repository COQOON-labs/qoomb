import { Injectable } from '@nestjs/common';

import { getEnv } from '../../config/env.validation';

export interface SystemConfig {
  allowOpenRegistration: boolean;
  allowForgotPassword: boolean;
  allowPasskeys: boolean;
}

/**
 * Exposes public system configuration to the frontend and enforces
 * operator-level access controls throughout the auth module.
 *
 * All values are read from environment variables validated by Zod at startup
 * (see env.validation.ts). An invalid or missing value causes the app to
 * refuse to start — no silent fallbacks.
 *
 * This is the single place in the codebase that reads ALLOW_* / ENABLE_*
 * env vars. No other module should call getEnv() for these flags.
 */
@Injectable()
export class SystemConfigService {
  /** Full config snapshot — used by the public getSystemConfig tRPC endpoint. */
  getConfig(): SystemConfig {
    const env = getEnv();
    return {
      allowOpenRegistration: env.ALLOW_OPEN_REGISTRATION,
      allowForgotPassword: env.ALLOW_FORGOT_PASSWORD,
      allowPasskeys: env.ALLOW_PASSKEYS,
    };
  }

  /** Whether self-service hive registration is open to anyone. */
  isOpenRegistrationAllowed(): boolean {
    return getEnv().ALLOW_OPEN_REGISTRATION;
  }

  /** Whether the forgot-password / reset-password flow is enabled. */
  isForgotPasswordAllowed(): boolean {
    return getEnv().ALLOW_FORGOT_PASSWORD;
  }

  /** Whether PassKey (WebAuthn) authentication is enabled. */
  isPasskeysAllowed(): boolean {
    return getEnv().ALLOW_PASSKEYS;
  }
}
