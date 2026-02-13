import { Injectable } from '@nestjs/common';

export interface SystemConfig {
  allowOpenRegistration: boolean;
  allowForgotPassword: boolean;
  allowPasskeys: boolean;
}

/**
 * Exposes public system configuration flags to the frontend.
 *
 * Configured via environment variables — no DB required:
 *   ALLOW_OPEN_REGISTRATION=false  (true = allow anyone to register)
 *   ALLOW_FORGOT_PASSWORD=true     (false = disable password reset flow)
 *   ALLOW_PASSKEYS=true            (false = PassKeys disabled)
 *
 * This endpoint is public (publicProcedure) so the frontend can adapt its UI
 * before a user is authenticated (e.g. hide/show the Register button).
 */
@Injectable()
export class SystemConfigService {
  getConfig(): SystemConfig {
    return {
      allowOpenRegistration: this.parseFlag('ALLOW_OPEN_REGISTRATION', false),
      allowForgotPassword: this.parseFlag('ALLOW_FORGOT_PASSWORD', true),
      allowPasskeys: this.parseFlag('ALLOW_PASSKEYS', true),
    };
  }

  private parseFlag(envKey: string, defaultValue: boolean): boolean {
    const value = process.env[envKey];
    if (value === undefined) return defaultValue;
    const v = value.toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes') return true;
    if (v === 'false' || v === '0' || v === 'no') return false;
    return defaultValue;
  }
}
