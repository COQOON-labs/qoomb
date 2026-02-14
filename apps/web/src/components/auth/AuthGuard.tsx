import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../../lib/auth/useAuth';

/**
 * Protects routes that require authentication.
 * Redirects to /login with the original path preserved in `state.from`
 * so the app can redirect back after a successful login.
 */
export function AuthGuard() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
