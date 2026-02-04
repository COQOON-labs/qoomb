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
   * JWT Configuration
   */
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters for security')
    .refine(
      (secret) => {
        // Ensure JWT_SECRET has sufficient entropy
        const uniqueChars = new Set(secret.split('')).size;
        return uniqueChars >= 10;
      },
      {
        message: 'JWT_SECRET must have sufficient entropy (variety of characters)',
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
   * AI Provider Configuration (Optional)
   */
  AI_PROVIDER: z.enum(['openai', 'anthropic', 'ollama', 'disabled']).default('disabled'),

  OPENAI_API_KEY: z.string().startsWith('sk-').optional(),

  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-').optional(),

  OLLAMA_BASE_URL: z.string().url().optional(),

  /**
   * CORS Configuration
   */
  ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',').map((s) => s.trim()) : [])),

  /**
   * Feature Flags
   */
  ENABLE_REGISTRATION: z
    .string()
    .default('true')
    .transform((val) => val === 'true'),

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
   * Session Configuration
   */
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters').optional(),

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
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars: string[] = [];
      const invalidVars: string[] = [];

      error.issues.forEach((err: any) => {
        const path = err.path.join('.');

        if (err.code === 'invalid_type' && err.received === 'undefined') {
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
