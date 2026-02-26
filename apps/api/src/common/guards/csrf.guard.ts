import * as crypto from 'crypto';

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import { CSRF_CONFIG } from '../../config/security.config';

/**
 * Decorator to skip CSRF protection for specific routes.
 * Use sparingly — only for webhooks or server-to-server endpoints.
 */
export const SKIP_CSRF_KEY = 'skipCsrf';
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);

/**
 * CSRF Protection Guard (Double-Submit Cookie Pattern)
 *
 * OWASP recommended defense-in-depth for APIs.
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
 *
 * How it works:
 * 1. A Fastify onRequest hook (in main.ts) sets a random CSRF token as a
 *    non-HttpOnly cookie (`qoomb_csrf`) on every response that doesn't
 *    already carry one.
 * 2. The SPA reads the cookie via `document.cookie` and sends the value
 *    as the `X-CSRF-Token` header on every state-changing request.
 * 3. This guard validates that the header matches the cookie using a
 *    constant-time comparison.
 *
 * Security properties:
 * - `SameSite=Strict` prevents cross-origin sites from sending the cookie
 * - Same-origin policy prevents cross-origin JS from reading the cookie
 * - CORS blocks cross-origin responses (attacker can't extract the token)
 * - Constant-time comparison prevents timing side-channels
 *
 * Safe methods (GET, HEAD, OPTIONS) are exempt because they must not
 * cause state changes.
 *
 * On the very first request (before the cookie is set) the guard allows
 * the request through because the onRequest hook will set the cookie on
 * the response for subsequent calls.  This bootstrap window is safe
 * because the first mutation is typically `auth.refresh` which is
 * protected by the HttpOnly SameSite refresh-token cookie.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private static readonly SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Check if CSRF is explicitly skipped for this handler
    const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipCsrf) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const method = request.method.toUpperCase();

    // Safe methods don't need CSRF protection
    if (CsrfGuard.SAFE_METHODS.has(method)) {
      return true;
    }

    // Read CSRF cookie from the request
    const csrfCookie = (request as unknown as { cookies?: Record<string, string> }).cookies?.[
      CSRF_CONFIG.COOKIE_NAME
    ];

    // If no CSRF cookie exists this is the first visit — the onRequest hook
    // will set it on the response so subsequent requests are protected.
    // Allow this request through; it is safe because cookie-authenticated
    // endpoints (refresh, logout) are protected by SameSite=Strict.
    if (!csrfCookie) {
      return true;
    }

    // Double-submit validation: X-CSRF-Token header must match cookie
    const csrfHeader = request.headers[CSRF_CONFIG.HEADER_NAME] as string | undefined;

    if (!csrfHeader) {
      throw new ForbiddenException('CSRF validation failed: missing X-CSRF-Token header');
    }

    // Constant-time comparison to prevent timing attacks
    const cookieBuf = Buffer.from(csrfCookie, 'utf8');
    const headerBuf = Buffer.from(csrfHeader, 'utf8');

    if (cookieBuf.length !== headerBuf.length || !crypto.timingSafeEqual(cookieBuf, headerBuf)) {
      throw new ForbiddenException('CSRF validation failed: token mismatch');
    }

    return true;
  }
}
