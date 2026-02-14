import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

/**
 * Decorator to skip CSRF protection for specific routes.
 * Use sparingly — only for webhooks or server-to-server endpoints.
 */
export const SKIP_CSRF_KEY = 'skipCsrf';
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);

/**
 * CSRF Protection Guard (Custom Request Header Pattern)
 *
 * OWASP recommended defense-in-depth for APIs using Authorization headers.
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
 *
 * How it works:
 * - All state-changing requests (POST, PUT, PATCH, DELETE) must include
 *   the header `X-CSRF-Protection: 1`
 * - Browsers prevent cross-origin sites from setting custom headers via forms
 * - Only JavaScript with CORS permission can set custom headers
 * - Combined with strict CORS config, this blocks CSRF attacks
 *
 * Safe methods (GET, HEAD, OPTIONS) are exempt because they should
 * not cause state changes.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private static readonly SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
  private static readonly REQUIRED_HEADER = 'x-csrf-protection';
  private static readonly REQUIRED_VALUE = '1';

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

    // Check for the custom CSRF header
    const csrfHeader = request.headers[CsrfGuard.REQUIRED_HEADER];

    if (csrfHeader !== CsrfGuard.REQUIRED_VALUE) {
      throw new ForbiddenException('CSRF validation failed: missing X-CSRF-Protection header');
    }

    return true;
  }
}
