/**
 * Read the CSRF double-submit cookie set by the API server.
 *
 * The API's Fastify onRequest hook sets a random `qoomb_csrf` cookie
 * (SameSite=Strict, NOT HttpOnly) on every response.  The SPA reads it
 * here and sends the value as the `X-CSRF-Token` header on mutations.
 * The server's CsrfGuard then validates that cookie === header.
 */
const CSRF_COOKIE_NAME = 'qoomb_csrf';

export function getCsrfToken(): string {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}
