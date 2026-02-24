/**
 * Security Configuration
 *
 * Centralized security settings for the application
 */

/**
 * Rate Limiting Configuration
 *
 * Different limits for different types of requests:
 * - Strict limits for auth endpoints (prevent brute force)
 * - Moderate limits for general API
 * - Higher limits for authenticated users
 */
export const RATE_LIMITS = {
  /**
   * Global rate limit (applies to all endpoints by default)
   * 300 requests per minute per IP/user
   *
   * This must be generous enough for normal SPA usage where a single
   * page load triggers multiple tRPC queries in parallel.
   * Sensitive endpoints (auth, registration, password reset) have their
   * own much stricter limits applied via @Throttle() decorators.
   */
  GLOBAL: {
    ttl: 60, // 1 minute in seconds
    limit: 300,
  },

  /**
   * Authentication endpoints (strict)
   * 5 login attempts per 15 minutes per IP
   * Prevents brute force attacks
   */
  AUTH: {
    ttl: 15 * 60, // 15 minutes
    limit: 5,
  },

  /**
   * Registration endpoint (very strict)
   * 3 registration attempts per hour per IP
   * Prevents spam account creation
   */
  REGISTRATION: {
    ttl: 60 * 60, // 1 hour
    limit: 3,
  },

  /**
   * Password reset (strict)
   * 3 password reset requests per hour per IP
   * Prevents email spam and enumeration
   */
  PASSWORD_RESET: {
    ttl: 60 * 60, // 1 hour
    limit: 3,
  },

  /**
   * Search/Query endpoints (moderate)
   * 50 searches per 5 minutes per user
   * Prevents search abuse and DoS
   */
  SEARCH: {
    ttl: 5 * 60, // 5 minutes
    limit: 50,
  },

  /**
   * Write operations (moderate)
   * 30 writes per minute per user
   * Prevents spam and abuse
   */
  WRITE: {
    ttl: 60, // 1 minute
    limit: 30,
  },
} as const;

/**
 * Password Security Configuration
 */
export const PASSWORD_CONFIG = {
  /**
   * Minimum password length
   */
  MIN_LENGTH: 8,

  /**
   * Maximum password length (prevent DoS via bcrypt)
   */
  MAX_LENGTH: 100,

  /**
   * bcrypt salt rounds
   * 10 is the current recommendation (2^10 = 1024 iterations)
   * Higher values = more secure but slower
   */
  SALT_ROUNDS: 10,

  /**
   * Password requirements regex
   */
  REQUIREMENTS_REGEX: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/,
} as const;

/**
 * JWT Configuration
 */
export const JWT_CONFIG = {
  /**
   * Access token expiration time (short-lived for security)
   */
  ACCESS_TOKEN_EXPIRES_IN: '15m',

  /**
   * Refresh token expiration (long-lived, stored in database)
   */
  REFRESH_TOKEN_EXPIRES_IN: '7d',

  /**
   * JWT algorithm — RS256 (asymmetric) allows distributing the public key
   * for verification without exposing the private signing key.
   */
  ALGORITHM: 'RS256' as const,

  /**
   * Access token expiration in seconds (for blacklist TTL)
   */
  ACCESS_TOKEN_EXPIRES_SECONDS: 15 * 60, // 15 minutes
} as const;

/**
 * Session Configuration
 */
export const SESSION_CONFIG = {
  /**
   * Maximum concurrent sessions per user
   */
  MAX_SESSIONS: 5,

  /**
   * Session timeout (in seconds)
   */
  TIMEOUT: 7 * 24 * 60 * 60, // 7 days
} as const;

/**
 * Input Validation Configuration
 */
export const VALIDATION_CONFIG = {
  /**
   * Maximum string length (general text)
   */
  MAX_STRING_LENGTH: 10000,

  /**
   * Maximum text length (large text fields)
   */
  MAX_TEXT_LENGTH: 100000,

  /**
   * Maximum array length
   */
  MAX_ARRAY_LENGTH: 1000,

  /**
   * Maximum file size (in bytes)
   */
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB

  /**
   * Maximum JSON payload size (in bytes)
   */
  MAX_JSON_SIZE: 5 * 1024 * 1024, // 5MB
} as const;

/**
 * CORS Configuration
 */
export const CORS_CONFIG = {
  /**
   * Allowed origins
   * In production, this should be set via environment variable
   */
  origins:
    process.env.NODE_ENV === 'production'
      ? process.env.ALLOWED_ORIGINS?.split(',') || []
      : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],

  /**
   * Allow credentials (cookies, authorization headers)
   */
  credentials: true,

  /**
   * Allowed methods
   */
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  /**
   * Allowed headers
   */
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Request-ID',
    'X-CSRF-Token',
  ],

  /**
   * Exposed headers
   */
  exposedHeaders: ['X-Total-Count', 'X-Request-ID'],

  /**
   * Max age for preflight requests (in seconds)
   */
  maxAge: 86400, // 24 hours
};

/**
 * Security Headers Configuration
 *
 * Note: CSP is primarily for browser-rendered content.
 * This API serves JSON responses, so CSP has limited effect.
 * However, we configure it properly for defense-in-depth.
 */
export const SECURITY_HEADERS = {
  /**
   * Content Security Policy
   * Removed 'unsafe-inline' to prevent XSS attacks (CWE-79)
   */
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },

  /**
   * Relaxed CSP for development (M-3 audit finding).
   * Uses 'unsafe-inline' and 'unsafe-eval' to support HMR / devtools,
   * but still blocks object/frame embedding and off-origin resources.
   */
  contentSecurityPolicyDev: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },

  /**
   * HSTS (HTTP Strict Transport Security)
   */
  strictTransportSecurity: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },

  /**
   * X-Frame-Options
   */
  frameguard: {
    action: 'deny',
  },

  /**
   * X-Content-Type-Options
   */
  noSniff: true,

  /**
   * X-XSS-Protection
   */
  xssFilter: true,
} as const;

/**
 * Refresh Token Cookie Configuration
 *
 * The refresh token is stored in an HttpOnly cookie instead of localStorage
 * to prevent XSS-based token theft (CWE-922).
 */
export const REFRESH_TOKEN_COOKIE = {
  NAME: 'qoomb_rt',
  HTTP_ONLY: true,
  SECURE: process.env.NODE_ENV === 'production',
  SAME_SITE: 'strict' as const,
  PATH: '/trpc',
  MAX_AGE_SECONDS: 7 * 24 * 60 * 60, // 7 days — matches refresh token lifetime
} as const;

/**
 * CSRF Double-Submit Cookie Configuration
 *
 * The server sets a random CSRF token as a non-HttpOnly cookie (readable by JS).
 * For every state-changing request the client reads the cookie and sends the
 * value as the X-CSRF-Token header.  The guard compares both values.
 *
 * Security properties:
 * - SameSite=Strict prevents cross-origin cookie sending
 * - Same-origin policy prevents cross-origin JS from reading the cookie
 * - CORS prevents cross-origin responses (can't extract the token)
 */
export const CSRF_CONFIG = {
  COOKIE_NAME: 'qoomb_csrf',
  HEADER_NAME: 'x-csrf-token',
  TOKEN_LENGTH: 32, // bytes → 43 base64url characters
  COOKIE_MAX_AGE_SECONDS: 7 * 24 * 60 * 60, // 7 days
} as const;

/**
 * Audit Log Configuration
 */
export const AUDIT_CONFIG = {
  /**
   * Events that should be logged
   */
  LOGGED_EVENTS: [
    'user.login',
    'user.logout',
    'user.register',
    'user.password_change',
    'user.password_reset',
    'hive.create',
    'hive.update',
    'hive.delete',
    'person.create',
    'person.delete',
    'data.export',
    'data.import',
    'permission.change',
  ] as const,

  /**
   * Retention period (in days)
   */
  RETENTION_DAYS: 90,
} as const;
