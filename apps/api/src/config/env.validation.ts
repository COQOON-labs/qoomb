import { z } from 'zod';

/**
 * Environment Variables Schema
 *
 * This schema validates all environment variables at application startup.
 * If validation fails, the application will not start and will show
 * detailed error messages about which variables are missing or invalid.
 *
 * Security benefits:
 * - Prevents application from starting with invalid configuration
 * - Catches configuration errors early in development
 * - Documents all required environment variables
 * - Type-safe access to environment variables throughout the app
 */

const envSchema = z.object({
  /**
   * Node Environment
   */
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /**
   * Server Configuration
   */
  PORT: z
    .string()
    .regex(/^\d+$/, 'PORT must be a number')
    .default('3001')
    .transform(Number)
    .pipe(z.number().int().positive().max(65535)),

  /**
   * Database Configuration
   */
  DATABASE_URL: z
    .string()
    .url('DATABASE_URL must be a valid PostgreSQL connection string')
    .refine((url) => url.startsWith('postgresql://') || url.startsWith('postgres://'), {
      message: 'DATABASE_URL must be a PostgreSQL connection string',
    }),

  /**
   * Redis Configuration
   */
  REDIS_URL: z
    .string()
    .url('REDIS_URL must be a valid Redis connection string')
    .refine((url) => url.startsWith('redis://'), {
      message: 'REDIS_URL must start with redis://',
    }),

  /**
   * JWT Configuration (RS256 asymmetric key pair)
   *
   * Keys must be base64-encoded PEM strings.
   * Generate with:
   *   openssl genpkey -algorithm RSA -out jwt-private.pem -pkeyopt rsa_keygen_bits:2048
   *   openssl rsa -pubout -in jwt-private.pem -out jwt-public.pem
   *   JWT_PRIVATE_KEY=$(base64 -w0 < jwt-private.pem)
   *   JWT_PUBLIC_KEY=$(base64 -w0 < jwt-public.pem)
   */
  JWT_PRIVATE_KEY: z
    .string()
    .min(1, 'JWT_PRIVATE_KEY is required (base64-encoded RSA private key PEM)')
    .refine(
      (val) => {
        try {
          const pem = Buffer.from(val, 'base64').toString('utf8');
          return pem.includes('PRIVATE KEY');
        } catch {
          return false;
        }
      },
      {
        message: 'JWT_PRIVATE_KEY must be a valid base64-encoded RSA private key in PEM format',
      }
    ),

  JWT_PUBLIC_KEY: z
    .string()
    .min(1, 'JWT_PUBLIC_KEY is required (base64-encoded RSA public key PEM)')
    .refine(
      (val) => {
        try {
          const pem = Buffer.from(val, 'base64').toString('utf8');
          return pem.includes('PUBLIC KEY');
        } catch {
          return false;
        }
      },
      {
        message: 'JWT_PUBLIC_KEY must be a valid base64-encoded RSA public key in PEM format',
      }
    ),

  JWT_EXPIRES_IN: z.string().default('7d'),

  /**
   * Encryption Configuration
   */
  KEY_PROVIDER: z.enum(['environment', 'file', 'aws-kms', 'vault'], {
    message: 'KEY_PROVIDER must be one of: environment, file, aws-kms, vault',
  }),

  // Required when KEY_PROVIDER=environment
  ENCRYPTION_KEY: z.string().optional(),

  // Required when KEY_PROVIDER=file
  KEY_FILE_PATH: z.string().optional(),
  KEY_FILE_PASSWORD: z.string().optional(),

  // Required when KEY_PROVIDER=aws-kms
  AWS_REGION: z.string().optional(),
  AWS_KMS_KEY_ID: z.string().optional(),

  // Required when KEY_PROVIDER=vault
  VAULT_ADDR: z.string().url().optional(),
  VAULT_TOKEN: z.string().optional(),
  VAULT_KEY_PATH: z.string().optional(),

  /**
   * CORS Configuration
   */
  ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',').map((s) => s.trim()) : [])),

  /**
   * System Configuration
   *
   * These are operator-level decisions that require a deliberate deployment
   * change — they cannot be toggled at runtime or via the UI.
   */

  /**
   * Allow anyone to self-register a new hive.
   * false (default) = invite-only. Set to true only for open SaaS deployments.
   */
  ALLOW_OPEN_REGISTRATION: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),

  /**
   * Allow users to request a password reset via email.
   * false (default) = disabled until email delivery is configured and verified.
   */
  ALLOW_FORGOT_PASSWORD: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),

  /**
   * Allow PassKey (WebAuthn) authentication.
   * true (default) = enabled. Set to false to disable WebAuthn entirely.
   */
  ALLOW_PASSKEYS: z
    .string()
    .default('true')
    .transform((val) => val === 'true'),

  /**
   * Enable external calendar synchronisation (Google, Apple, Outlook).
   * false (default) = disabled until Phase 5 is complete.
   */
  ENABLE_EXTERNAL_CALENDAR_SYNC: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),

  /**
   * Security Configuration
   */
  RATE_LIMIT_ENABLED: z
    .string()
    .default('true')
    .transform((val) => val === 'true'),

  BCRYPT_SALT_ROUNDS: z
    .string()
    .regex(/^\d+$/)
    .default('10')
    .transform(Number)
    .pipe(z.number().int().min(10).max(15)),

  /**
   * Logging Configuration
   */
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'verbose']).default('info'),

  /**
   * Locale Configuration
   *
   * Platform-wide default locale (BCP 47 tag, e.g. 'en-US', 'de-DE').
   * This is the lowest-priority fallback — overridden by hive and user preferences.
   */
  DEFAULT_LOCALE: z
    .string()
    .regex(
      /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/,
      'DEFAULT_LOCALE must be a valid BCP 47 locale (e.g. "en-US", "de-DE")'
    )
    .default('en-US'),

  /**
   * Session Configuration
   */
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters').optional(),

  /**
   * WebAuthn / PassKey Configuration
   *
   * These must match the origin the browser uses to access the app.
   * For simple dev (just dev-start-simple): use http://localhost:5173
   * For full dev with Caddy (just dev-start): use https://qoomb.localhost:8443
   * Multiple origins can be comma-separated: "https://qoomb.localhost:8443,http://localhost:5173"
   *
   * RP ID constraint: the RP ID must be a registrable domain suffix of ALL listed origins.
   * Example: RP ID "localhost" is valid for both "http://localhost:5173" and
   * "https://qoomb.localhost:8443" because "localhost" is a suffix of "qoomb.localhost".
   */
  WEBAUTHN_RP_ID: z
    .string()
    .default('localhost')
    .refine(
      (val) =>
        val === 'localhost' ||
        /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(val),
      {
        message:
          'WEBAUTHN_RP_ID must be a valid hostname (e.g. "localhost", "qoomb.localhost", "example.com")',
      }
    ),

  WEBAUTHN_RP_NAME: z.string().default('Qoomb'),

  WEBAUTHN_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .refine(
      (val) => {
        const origins = val
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        return (
          origins.length > 0 &&
          origins.every((origin) => {
            try {
              const url = new URL(origin);
              return url.protocol === 'https:' || url.protocol === 'http:';
            } catch {
              return false;
            }
          })
        );
      },
      { message: 'WEBAUTHN_ORIGIN must be one or more valid http/https URLs, comma-separated' }
    ),

  /**
   * Email Configuration (for future use)
   */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().regex(/^\d+$/).transform(Number).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
});

/**
 * Validated environment variables type
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Validate environment variables
 *
 * This function should be called at application startup (in main.ts)
 * to ensure all required environment variables are present and valid.
 *
 * @throws {Error} if validation fails with detailed error message
 */
export function validateEnv(): Env {
  // Env files may contain KEY= with no value — treat empty strings as undefined
  // so that Zod's .optional() properly skips validation for unset variables.
  const env = Object.fromEntries(
    Object.entries(process.env).map(([key, val]) => [key, val === '' ? undefined : val])
  );

  try {
    return envSchema.parse(env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars: string[] = [];
      const invalidVars: string[] = [];

      error.issues.forEach((err) => {
        const path = err.path.join('.');

        if (err.code === 'invalid_type' && 'received' in err && err.received === 'undefined') {
          missingVars.push(path);
        } else {
          invalidVars.push(`${path}: ${err.message}`);
        }
      });

      let errorMessage = '\n❌ Environment validation failed:\n\n';

      if (missingVars.length > 0) {
        errorMessage += '📋 Missing required variables:\n';
        missingVars.forEach((v) => {
          errorMessage += `  - ${v}\n`;
        });
        errorMessage += '\n';
      }

      if (invalidVars.length > 0) {
        errorMessage += '⚠️  Invalid variables:\n';
        invalidVars.forEach((v) => {
          errorMessage += `  - ${v}\n`;
        });
        errorMessage += '\n';
      }

      errorMessage += '💡 Tip: Copy .env.example to .env and fill in the required values.\n';

      throw new Error(errorMessage);
    }

    throw error;
  }
}

/**
 * Get validated environment variables
 *
 * Use this function to access environment variables throughout the app
 * instead of process.env directly. This ensures type safety.
 */
let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = validateEnv();
  }
  return cachedEnv;
}
