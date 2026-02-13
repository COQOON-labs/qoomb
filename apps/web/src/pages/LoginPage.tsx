import { Button, Input } from '@qoomb/ui';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { PassKeyButton } from '../components/auth/PassKeyButton';
import { AuthLayout } from '../layouts/AuthLayout';
import { useAuth } from '../lib/auth/useAuth';
import { trpc } from '../lib/trpc/client';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      login(
        {
          id: data.user.id,
          email: data.user.email,
          hiveId: data.user.hiveId,
          personId: data.user.personId ?? '',
          hiveName: data.hive.name,
        },
        data.accessToken,
        data.refreshToken
      );
      void navigate(from, { replace: true });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const systemConfig = trpc.auth.getSystemConfig.useQuery();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    loginMutation.mutate({ email, password });
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your hive">
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          error={error || undefined}
        />

        {systemConfig.data?.allowForgotPassword && (
          <div className="text-right">
            <Link
              to="/forgot-password"
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        )}

        <Button type="submit" fullWidth isLoading={loginMutation.isPending} className="mt-2">
          Sign in
        </Button>
      </form>

      {systemConfig.data?.allowPasskeys && (
        <>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>
          <PassKeyButton email={email || undefined} redirectTo={from} />
        </>
      )}

      {systemConfig.data?.allowOpenRegistration && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          No account?{' '}
          <Link to="/register" className="font-medium text-foreground hover:underline">
            Create one
          </Link>
        </p>
      )}
    </AuthLayout>
  );
}
