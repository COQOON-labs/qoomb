import type { AppRouter } from '@qoomb/api/src/trpc/app.router';
import { createTRPCProxyClient, httpLink } from '@trpc/client';
import { createContext, useContext, useEffect, useReducer, useRef, type ReactNode } from 'react';
import superjson from 'superjson';

import { getRefreshToken, setRefreshToken, clearRefreshToken } from './authStorage';
import { setAccessToken } from './tokenStore';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  hiveId: string;
  personId: string;
  hiveName?: string;
  isSystemAdmin?: boolean;
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
}

type AuthAction =
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'LOGIN'; user: AuthUser; accessToken: string; refreshToken: string }
  | { type: 'REFRESH'; accessToken: string; refreshToken: string }
  | { type: 'SWITCH_HIVE'; hiveId: string; hiveName: string; personId: string; accessToken: string }
  | { type: 'LOGOUT' };

interface AuthContextValue {
  state: AuthState;
  login: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  logout: () => Promise<void>;
  updateToken: (accessToken: string, refreshToken: string) => void;
  switchHive: (hiveId: string, hiveName: string, personId: string, accessToken: string) => void;
}

// ── Reducer ───────────────────────────────────────────────────────────────────

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.loading };
    case 'LOGIN':
    case 'REFRESH':
      setAccessToken(action.accessToken);
      setRefreshToken(action.refreshToken);
      return {
        user: action.type === 'LOGIN' ? action.user : state.user,
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
            }
          : state.user,
      };
    case 'LOGOUT':
      setAccessToken(null);
      clearRefreshToken();
      return { user: null, accessToken: null, isLoading: false };
    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// Standalone tRPC client used only for the silent refresh call.
// It doesn't need auth headers (uses the refresh token in the body).
function createRefreshClient() {
  const url = import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/trpc`
    : `${window.location.origin}/trpc`;

  return createTRPCProxyClient<AppRouter>({
    links: [httpLink({ url, transformer: superjson })],
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

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshClientRef = useRef<ReturnType<typeof createRefreshClient> | null>(null);

  function getRefreshClient() {
    if (!refreshClientRef.current) {
      refreshClientRef.current = createRefreshClient();
    }
    return refreshClientRef.current;
  }

  function scheduleRefresh(accessToken: string, refreshToken: string) {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    const exp = parseJwtExp(accessToken);
    if (!exp) return;

    const msUntilExpiry = exp * 1000 - Date.now();
    const msUntilRefresh = Math.max(msUntilExpiry - 300_000, 0); // 5 min before expiry

    refreshTimerRef.current = setTimeout(() => {
      void doRefresh(refreshToken);
    }, msUntilRefresh);
  }

  async function doRefresh(refreshToken: string): Promise<boolean> {
    try {
      const result = await getRefreshClient().auth.refresh.mutate({ refreshToken });
      dispatch({
        type: 'REFRESH',
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
      scheduleRefresh(result.accessToken, result.refreshToken);
      return true;
    } catch {
      dispatch({ type: 'LOGOUT' });
      return false;
    }
  }

  // Silent refresh on mount
  useEffect(() => {
    const storedRefreshToken = getRefreshToken();
    if (!storedRefreshToken) {
      dispatch({ type: 'SET_LOADING', loading: false });
      return;
    }

    void (async () => {
      dispatch({ type: 'SET_LOADING', loading: true });
      const refreshed = await doRefresh(storedRefreshToken);
      if (!refreshed) {
        dispatch({ type: 'SET_LOADING', loading: false });
      }
    })();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function login(user: AuthUser, accessToken: string, refreshToken: string) {
    dispatch({ type: 'LOGIN', user, accessToken, refreshToken });
    scheduleRefresh(accessToken, refreshToken);
  }

  async function logout() {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    // Best-effort: revoke refresh token on the server.
    // We must read tokens BEFORE dispatching LOGOUT (which clears them).
    const accessToken = state.accessToken;
    const refreshToken = getRefreshToken();

    // Clear local state immediately so the user sees the logout UI at once
    dispatch({ type: 'LOGOUT' });

    if (accessToken && refreshToken) {
      try {
        await getRefreshClient().auth.logout.mutate({ accessToken, refreshToken });
      } catch {
        // Ignore — local state is already cleared; server tokens expire naturally
      }
    }
  }

  function updateToken(accessToken: string, refreshToken: string) {
    dispatch({ type: 'REFRESH', accessToken, refreshToken });
    scheduleRefresh(accessToken, refreshToken);
  }

  function switchHive(hiveId: string, hiveName: string, personId: string, accessToken: string) {
    // Hive switch issues a new access token; refresh token is unchanged
    const existingRefreshToken = getRefreshToken() ?? '';
    dispatch({ type: 'SWITCH_HIVE', hiveId, hiveName, personId, accessToken });
    scheduleRefresh(accessToken, existingRefreshToken);
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
