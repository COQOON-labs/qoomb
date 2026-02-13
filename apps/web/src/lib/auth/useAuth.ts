import { useAuthContext, type AuthState, type AuthUser } from './AuthContext';

export interface UseAuthReturn {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  logout: () => Promise<void>;
  updateToken: (accessToken: string, refreshToken: string) => void;
  switchHive: (hiveId: string, hiveName: string, personId: string, accessToken: string) => void;
}

/**
 * Hook to access auth state and actions from anywhere in the component tree.
 *
 * @example
 * const { user, isAuthenticated, login, logout } = useAuth();
 */
export function useAuth() {
  const { state, login, logout, updateToken, switchHive } = useAuthContext();

  return {
    user: state.user,
    accessToken: state.accessToken,
    isLoading: state.isLoading,
    isAuthenticated: state.user !== null && state.accessToken !== null,
    login,
    logout,
    updateToken,
    switchHive,
  };
}
