/**
 * In-memory access token store.
 *
 * This module-level singleton lets the tRPC provider read the latest
 * access token without creating a React context dependency cycle.
 * The access token is NEVER written to localStorage or sessionStorage.
 */
let currentToken: string | null = null;

export function getAccessToken(): string | null {
  return currentToken;
}

export function setAccessToken(token: string | null): void {
  currentToken = token;
}
