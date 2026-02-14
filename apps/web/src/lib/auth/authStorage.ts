/**
 * Persistent storage helpers for the refresh token.
 *
 * Only the refresh token touches localStorage — the access token lives
 * exclusively in memory (AuthContext state) to reduce XSS exposure.
 */
const REFRESH_TOKEN_KEY = 'qoomb:refreshToken';

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setRefreshToken(token: string): void {
  try {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  } catch {
    // Storage unavailable (private browsing quota, etc.) — fail silently
  }
}

export function clearRefreshToken(): void {
  try {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // ignore
  }
}
