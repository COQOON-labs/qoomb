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
   * Get the tracker identifier for rate limiting
   *
   * For authenticated requests: use user ID
   * For unauthenticated requests: use IP address
   *
   * Note: In @nestjs/throttler v6, getTracker receives (req, context)
   * and is called as a standalone function (not as a method on `this`).
   * We must NOT reference `this` — use static helpers instead.
   */
  protected async getTracker(
    req: Record<string, any>,
    _context?: ExecutionContext
  ): Promise<string> {
    const request = req as FastifyRequest & { user?: { id: string } };

    // If user is authenticated, track by user ID
    if (request.user?.id) {
      return `user:${request.user.id}`;
    }

    // Otherwise, track by IP address
    return CustomThrottlerGuard.extractIp(request);
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
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail
  ): Promise<void> {
    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: { id: string } }>();
    const tracker = await this.getTracker(request, context);
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
