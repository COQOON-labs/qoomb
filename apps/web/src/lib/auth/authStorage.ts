/**
 * Auth storage helpers — DEPRECATED.
 *
 * The refresh token is now stored in an HttpOnly cookie set by the server.
 * This module only clears any stale localStorage value left from a previous
 * version.  It will be removed entirely in a future release.
 */

const REFRESH_TOKEN_KEY = 'qoomb:refreshToken';

/** Remove any stale refresh token left from the localStorage era. */
export function clearLegacyRefreshToken(): void {
  try {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // ignore
  }
}
