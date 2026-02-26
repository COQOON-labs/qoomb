import * as crypto from 'crypto';

import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module';
import { validateEnv } from './config/env.validation';
import { CORS_CONFIG, CSRF_CONFIG, SECURITY_HEADERS } from './config/security.config';

// ── JWT RS256 key pair validation ──────────────────────────────────────────

class JwtKeyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwtKeyValidationError';
  }
}

/**
 * Validate JWT RS256 key pair at startup.
 *
 * Performs deep validation:
 * 1. Keys are present and base64-decodable
 * 2. PEM format is correct (contains PRIVATE KEY / PUBLIC KEY markers)
 * 3. RSA key size is at least 2048 bits
 * 4. The key pair matches (test sign + verify)
 *
 * Throws `JwtKeyValidationError` with a clear, human-readable error banner
 * so operators can diagnose the issue without digging through stack traces.
 */
function validateJwtKeys(logger: Logger): void {
  const privateKeyB64 = process.env.JWT_PRIVATE_KEY;
  const publicKeyB64 = process.env.JWT_PUBLIC_KEY;

  // ── Missing keys ───────────────────────────────────────────────────────
  if (!privateKeyB64 || !publicKeyB64) {
    const missing = [!privateKeyB64 && 'JWT_PRIVATE_KEY', !publicKeyB64 && 'JWT_PUBLIC_KEY']
      .filter(Boolean)
      .join(', ');

    throw new JwtKeyValidationError(
      '\n' +
        '╔══════════════════════════════════════════════════════════════════╗\n' +
        '║  FATAL: JWT RS256 key pair is not configured                   ║\n' +
        '╠══════════════════════════════════════════════════════════════════╣\n' +
        `║  Missing: ${missing.padEnd(52)}║\n` +
        '║                                                                  ║\n' +
        '║  Generate a key pair:                                            ║\n' +
        '║    openssl genpkey -algorithm RSA -out jwt-private.pem \\        ║\n' +
        '║      -pkeyopt rsa_keygen_bits:2048                              ║\n' +
        '║    openssl rsa -pubout -in jwt-private.pem -out jwt-public.pem  ║\n' +
        '║                                                                  ║\n' +
        '║  Then base64-encode for .env:                                    ║\n' +
        '║    JWT_PRIVATE_KEY=$(base64 -w0 < jwt-private.pem)              ║\n' +
        '║    JWT_PUBLIC_KEY=$(base64 -w0 < jwt-public.pem)                ║\n' +
        '╚══════════════════════════════════════════════════════════════════╝'
    );
  }

  // ── Decode base64 → PEM ────────────────────────────────────────────────
  let privateKeyPem: string;
  let publicKeyPem: string;

  try {
    privateKeyPem = Buffer.from(privateKeyB64, 'base64').toString('utf8');
  } catch {
    throw new JwtKeyValidationError(
      '\n' +
        '╔══════════════════════════════════════════════════════════════════╗\n' +
        '║  FATAL: JWT_PRIVATE_KEY is not valid base64                    ║\n' +
        '║                                                                  ║\n' +
        '║  The value must be the base64-encoded content of a PEM file.    ║\n' +
        '║  Encode it with:  base64 -w0 < jwt-private.pem                 ║\n' +
        '╚══════════════════════════════════════════════════════════════════╝'
    );
  }

  try {
    publicKeyPem = Buffer.from(publicKeyB64, 'base64').toString('utf8');
  } catch {
    throw new JwtKeyValidationError(
      '\n' +
        '╔══════════════════════════════════════════════════════════════════╗\n' +
        '║  FATAL: JWT_PUBLIC_KEY is not valid base64                     ║\n' +
        '║                                                                  ║\n' +
        '║  The value must be the base64-encoded content of a PEM file.    ║\n' +
        '║  Encode it with:  base64 -w0 < jwt-public.pem                  ║\n' +
        '╚══════════════════════════════════════════════════════════════════╝'
    );
  }

  // ── Validate PEM structure ─────────────────────────────────────────────
  if (!privateKeyPem.includes('PRIVATE KEY')) {
    throw new JwtKeyValidationError(
      '\n' +
        '╔══════════════════════════════════════════════════════════════════╗\n' +
        '║  FATAL: JWT_PRIVATE_KEY does not contain a PEM private key     ║\n' +
        '║                                                                  ║\n' +
        '║  Expected a base64-encoded PEM file containing a PRIVATE KEY   ║\n' +
        '║  header (e.g. "BEGIN PRIVATE KEY" delimiters).                ║\n' +
        '╚══════════════════════════════════════════════════════════════════╝'
    );
  }

  if (!publicKeyPem.includes('PUBLIC KEY')) {
    throw new JwtKeyValidationError(
      '\n' +
        '╔══════════════════════════════════════════════════════════════════╗\n' +
        '║  FATAL: JWT_PUBLIC_KEY does not contain a PEM public key       ║\n' +
        '║                                                                  ║\n' +
        '║  Expected a base64-encoded PEM file containing a PUBLIC KEY    ║\n' +
        '║  header (e.g. "BEGIN PUBLIC KEY" delimiters).                 ║\n' +
        '╚══════════════════════════════════════════════════════════════════╝'
    );
  }

  // ── Validate key size ──────────────────────────────────────────────────
  let keyBits: number | undefined;
  try {
    const keyObject = crypto.createPublicKey(publicKeyPem);
    // Export the key as JWK to read the modulus length (n), which tells us
    // the RSA key size.  `asymmetricKeySize` is not available in all Node
    // versions, so JWK export is the portable approach.
    const jwk = keyObject.export({ format: 'jwk' });
    const modulus = jwk.n;
    if (modulus) {
      // JWK encodes the modulus as base64url; byte length * 8 = bit size
      const modulusBytes = Buffer.from(modulus, 'base64url').length;
      keyBits = modulusBytes * 8;
      if (keyBits < 2048) {
        throw new JwtKeyValidationError(
          '\n' +
            '╔══════════════════════════════════════════════════════════════════╗\n' +
            `║  FATAL: JWT RSA key is too small (${keyBits} bits)${' '.repeat(Math.max(0, 25 - String(keyBits).length))}║\n` +
            '║                                                                  ║\n' +
            '║  Minimum required key size: 2048 bits                           ║\n' +
            '║  Regenerate with:                                                ║\n' +
            '║    openssl genpkey -algorithm RSA -out jwt-private.pem \\        ║\n' +
            '║      -pkeyopt rsa_keygen_bits:2048                              ║\n' +
            '╚══════════════════════════════════════════════════════════════════╝'
        );
      }
    }
  } catch (err: unknown) {
    if (err instanceof JwtKeyValidationError) throw err;
    throw new JwtKeyValidationError(
      '\n' +
        '╔══════════════════════════════════════════════════════════════════╗\n' +
        '║  FATAL: JWT_PUBLIC_KEY cannot be parsed as an RSA public key   ║\n' +
        '║                                                                  ║\n' +
        '║  Ensure the PEM file was generated correctly.                   ║\n' +
        '╚══════════════════════════════════════════════════════════════════╝'
    );
  }

  // ── Test sign + verify (key pair match) ────────────────────────────────
  try {
    const testPayload = 'qoomb-jwt-key-validation';
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(testPayload);
    const signature = signer.sign(privateKeyPem);

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(testPayload);
    if (!verifier.verify(publicKeyPem, signature)) {
      throw new Error('signature verification returned false');
    }
  } catch (err: unknown) {
    if (err instanceof JwtKeyValidationError) throw err;
    const message = err instanceof Error ? err.message : 'unknown';
    throw new JwtKeyValidationError(
      '\n' +
        '╔══════════════════════════════════════════════════════════════════╗\n' +
        '║  FATAL: JWT key pair validation failed                         ║\n' +
        '╠══════════════════════════════════════════════════════════════════╣\n' +
        '║  The private and public keys do not form a matching pair.      ║\n' +
        '║                                                                  ║\n' +
        '║  Make sure the public key was derived from the private key:    ║\n' +
        '║    openssl rsa -pubout -in jwt-private.pem -out jwt-public.pem ║\n' +
        '║                                                                  ║\n' +
        `║  Error: ${message.slice(0, 54).padEnd(54)}║\n` +
        '╚══════════════════════════════════════════════════════════════════╝'
    );
  }

  // ── Success ────────────────────────────────────────────────────────────
  logger.log(`JWT RS256 key pair validated successfully (${keyBits ?? '?'}-bit RSA)`);
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // ── Early security checks — fail fast with clear messages ──────────────
  // validateEnv checks all required env vars (Zod schema).
  // validateJwtKeys does deeper RSA key-pair checks (size, pair match).
  validateEnv();
  validateJwtKeys(logger);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: process.env.NODE_ENV === 'development',
      // Trust the first proxy hop (e.g. Caddy, Nginx, cloud LB).
      // Set to a specific IP/CIDR (e.g. '10.0.0.0/8') in production if the
      // proxy address is known.  Avoids trusting arbitrary X-Forwarded-For
      // headers which would allow rate-limit bypass via IP spoofing (CWE-346).
      trustProxy: process.env.TRUSTED_PROXY ?? 1,
    })
  );

  // Security Headers with Helmet
  const helmetOptions = {
    contentSecurityPolicy:
      process.env.NODE_ENV === 'development'
        ? SECURITY_HEADERS.contentSecurityPolicyDev
        : SECURITY_HEADERS.contentSecurityPolicy,
    hsts: SECURITY_HEADERS.strictTransportSecurity,
    frameguard: SECURITY_HEADERS.frameguard,
    noSniff: SECURITY_HEADERS.noSniff,
    xssFilter: SECURITY_HEADERS.xssFilter,
  };
  await app.register(helmet, helmetOptions);

  // Cookie support — refresh token is stored in an HttpOnly cookie (CWE-922).
  await app.register(cookie);

  // ── CSRF double-submit cookie ──────────────────────────────────────────
  // On every response, ensure a CSRF cookie exists.  The browser will
  // include this cookie on same-origin requests; the SPA reads it via
  // document.cookie and sends the value as the X-CSRF-Token header.
  // The CsrfGuard validates that both match on state-changing requests.
  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.addHook('onRequest', (request, reply, done) => {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    if (!cookies?.[CSRF_CONFIG.COOKIE_NAME]) {
      const token = crypto.randomBytes(CSRF_CONFIG.TOKEN_LENGTH).toString('base64url');
      void reply.setCookie(CSRF_CONFIG.COOKIE_NAME, token, {
        httpOnly: false, // Must be readable by JavaScript
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: CSRF_CONFIG.COOKIE_MAX_AGE_SECONDS,
      });
    }
    done();
  });

  // Enable CORS with comprehensive configuration
  app.enableCors({
    origin: CORS_CONFIG.origins,
    credentials: CORS_CONFIG.credentials,
    methods: CORS_CONFIG.methods,
    allowedHeaders: CORS_CONFIG.allowedHeaders,
    exposedHeaders: CORS_CONFIG.exposedHeaders,
    maxAge: CORS_CONFIG.maxAge,
  });

  const port = process.env.API_PORT || 3001;
  const host = process.env.API_HOST || 'localhost';

  await app.listen(port, host);

  logger.log(`
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   Qoomb API Server Running                              │
│                                                         │
│   Environment: ${(process.env.NODE_ENV || 'development').padEnd(39)}│
│   URL: http://${host}:${port}                          │
│   Security: ✓ RS256 JWT Signing                        │
│              ✓ Rate Limiting                            │
│              ✓ Helmet Headers                          │
│              ✓ CORS Protection                         │
│              ✓ CSRF Double-Submit Cookie               │
│                                                         │
└─────────────────────────────────────────────────────────┘
  `);
}

void bootstrap();
