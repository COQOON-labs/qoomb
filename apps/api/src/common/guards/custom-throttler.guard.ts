import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException, ThrottlerLimitDetail } from '@nestjs/throttler';
import { FastifyRequest } from 'fastify';

/**
 * Custom Throttler Guard
 *
 * Extends the default ThrottlerGuard to support:
 * - User-based rate limiting for authenticated requests
 * - IP-based rate limiting for unauthenticated requests
 * - Custom error messages
 * - Better logging for security monitoring
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  /**
   * Get the tracker identifier for rate limiting.
   *
   * For authenticated requests: use user ID
   * For unauthenticated requests: use IP address
   *
   * The base class types this parameter as `Record<string, unknown>` because
   * it is transport-agnostic. The actual runtime value is always a FastifyRequest,
   * so the single cast via `unknown` is intentional and safe — it is the minimum
   * escape hatch required by the library's interface.
   */
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    // The base class types this parameter as Record<string, unknown> (transport-agnostic).
    // The actual runtime value is always a FastifyRequest — the cast via unknown is the
    // minimum escape hatch required by the library's interface and exists only here.

    const request = req as unknown as FastifyRequest & { user?: { id: string } };
    return Promise.resolve(CustomThrottlerGuard.resolveTracker(request));
  }

  /**
   * Shared tracker resolution — used by both getTracker and throwThrottlingException.
   * Takes a typed FastifyRequest so neither call site needs an extra cast.
   */
  private static resolveTracker(req: FastifyRequest & { user?: { id: string } }): string {
    return req.user?.id ? `user:${req.user.id}` : CustomThrottlerGuard.extractIp(req);
  }

  /**
   * Extract IP address from request
   *
   * Handles both direct connections and proxied requests
   * (X-Forwarded-For, X-Real-IP).
   *
   * Static so it can be called without `this` context.
   */
  private static extractIp(req: FastifyRequest): string {
    // Check for X-Forwarded-For header (proxied requests)
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      // Take the first IP if multiple are present
      const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
      return ips.split(',')[0].trim();
    }

    // Check for X-Real-IP header (Nginx proxy)
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    // Fallback to direct IP
    return req.ip || 'unknown';
  }

  /**
   * Custom error handler with better logging
   */
  protected override throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail
  ): Promise<void> {
    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: { id: string } }>();
    const tracker = CustomThrottlerGuard.resolveTracker(request);
    const safeTracker = tracker.replace(/[\r\n]/g, '');
    // Strip newlines/carriage-returns to prevent log injection (CWE-117 / js/log-injection)
    const url = request.url.replace(/[\r\n]/g, '');

    console.warn(
      `[RATE_LIMIT] Throttled request from ${safeTracker} to ${url} ` +
        `(limit: ${throttlerLimitDetail.limit}, ttl: ${throttlerLimitDetail.ttl}s)`
    );

    throw new ThrottlerException('Too many requests. Please try again later.');
  }
}
