import type { AppRouter } from '@qoomb/api/src/trpc/app.router';
import { createTRPCProxyClient, httpLink } from '@trpc/client';
import { createContext, useContext, useEffect, useReducer, useRef, type ReactNode } from 'react';
import superjson from 'superjson';

import { getCsrfToken } from '../csrf';
import { useLocale } from '../locale/LocaleProvider';

import { setAccessToken } from './tokenStore';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  hiveId: string;
  personId: string;
  hiveName?: string;
  isSystemAdmin?: boolean;
  /** Resolved BCP 47 locale from server (user > hive > platform default) */
  locale?: string;
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
}

type AuthAction =
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'LOGIN'; user: AuthUser; accessToken: string }
  | { type: 'REFRESH'; user: AuthUser; accessToken: string }
  | {
      type: 'SWITCH_HIVE';
      hiveId: string;
      hiveName: string;
      personId: string;
      accessToken: string;
      locale?: string;
    }
  | { type: 'LOGOUT' };

interface AuthContextValue {
  state: AuthState;
  login: (user: AuthUser, accessToken: string) => void;
  logout: () => Promise<void>;
  updateToken: (accessToken: string) => void;
  switchHive: (
    hiveId: string,
    hiveName: string,
    personId: string,
    accessToken: string,
    locale?: string
  ) => void;
}

// ── Reducer ───────────────────────────────────────────────────────────────────

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.loading };
    case 'LOGIN':
    case 'REFRESH':
      setAccessToken(action.accessToken);
      return {
        user: action.user,
        accessToken: action.accessToken,
        isLoading: false,
      };
    case 'SWITCH_HIVE':
      setAccessToken(action.accessToken);
      return {
        ...state,
        accessToken: action.accessToken,
        user: state.user
          ? {
              ...state.user,
              hiveId: action.hiveId,
              hiveName: action.hiveName,
              personId: action.personId,
              locale: action.locale ?? state.user.locale,
            }
          : state.user,
      };
    case 'LOGOUT':
      setAccessToken(null);
      return { user: null, accessToken: null, isLoading: false };
    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// Standalone tRPC client used only for the silent refresh and logout calls.
// Sends credentials (cookies) so the HttpOnly refresh token cookie is included.
function createRefreshClient() {
  const url = import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/trpc`
    : `${window.location.origin}/trpc`;

  return createTRPCProxyClient<AppRouter>({
    links: [
      httpLink({
        url,
        transformer: superjson,
        headers: () => ({
          'X-CSRF-Token': getCsrfToken(),
        }),
        // Include credentials so the browser sends the HttpOnly refresh token cookie
        fetch: (input, init) => globalThis.fetch(input, { ...init, credentials: 'include' }),
      }),
    ],
  });
}

/** Parse a JWT and return its expiry as a Unix timestamp (seconds). */
function parseJwtExp(token: string): number | null {
  try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number;
    };
    return decoded.exp ?? null;
  } catch {
    return null;
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    accessToken: null,
    isLoading: true,
  });

  const { setLocale } = useLocale();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshClientRef = useRef<ReturnType<typeof createRefreshClient> | null>(null);

  function getRefreshClient() {
    if (!refreshClientRef.current) {
      refreshClientRef.current = createRefreshClient();
    }
    return refreshClientRef.current;
  }

  function scheduleRefresh(accessToken: string) {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    const exp = parseJwtExp(accessToken);
    if (!exp) return;

    const msUntilExpiry = exp * 1000 - Date.now();
    const msUntilRefresh = Math.max(msUntilExpiry - 300_000, 0); // 5 min before expiry

    refreshTimerRef.current = setTimeout(() => {
      void doRefresh();
    }, msUntilRefresh);
  }

  async function doRefresh(): Promise<boolean> {
    try {
      // Refresh token is sent automatically via HttpOnly cookie
      const result = await getRefreshClient().auth.refresh.mutate();
      const resolvedLocale = result.locale;
      dispatch({
        type: 'REFRESH',
        user: {
          id: result.user.id,
          email: result.user.email,
          hiveId: result.user.hiveId,
          personId: result.user.personId,
          hiveName: result.hive.name,
          locale: resolvedLocale,
        },
        accessToken: result.accessToken,
      });
      if (resolvedLocale) setLocale(resolvedLocale);
      scheduleRefresh(result.accessToken);
      return true;
    } catch {
      dispatch({ type: 'LOGOUT' });
      return false;
    }
  }

  // Silent refresh on mount — the browser sends the HttpOnly cookie automatically.
  // If no cookie exists (first visit), the server returns UNAUTHORIZED and we
  // transition to the logged-out state.
  useEffect(() => {
    void (async () => {
      dispatch({ type: 'SET_LOADING', loading: true });
      const refreshed = await doRefresh();
      if (!refreshed) {
        dispatch({ type: 'SET_LOADING', loading: false });
      }
    })();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function login(user: AuthUser, accessToken: string) {
    dispatch({ type: 'LOGIN', user, accessToken });
    if (user.locale) setLocale(user.locale);
    scheduleRefresh(accessToken);
  }

  async function logout() {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    // Best-effort: revoke refresh token on the server.
    // We must read the access token BEFORE dispatching LOGOUT (which clears it).
    const accessToken = state.accessToken;

    // Clear local state immediately so the user sees the logout UI at once
    dispatch({ type: 'LOGOUT' });

    if (accessToken) {
      try {
        // Refresh token is sent via HttpOnly cookie; only accessToken in body
        await getRefreshClient().auth.logout.mutate({ accessToken });
      } catch {
        // Ignore — local state is already cleared; server tokens expire naturally
      }
    }
  }

  function updateToken(accessToken: string) {
    if (!state.user) return;
    dispatch({ type: 'REFRESH', user: state.user, accessToken });
    scheduleRefresh(accessToken);
  }

  function switchHive(
    hiveId: string,
    hiveName: string,
    personId: string,
    accessToken: string,
    locale?: string
  ) {
    // Hive switch issues a new access token; refresh token cookie is unchanged
    dispatch({ type: 'SWITCH_HIVE', hiveId, hiveName, personId, accessToken, locale });
    if (locale) setLocale(locale);
    scheduleRefresh(accessToken);
  }

  return (
    <AuthContext.Provider value={{ state, login, logout, updateToken, switchHive }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used inside <AuthProvider>');
  return ctx;
}
