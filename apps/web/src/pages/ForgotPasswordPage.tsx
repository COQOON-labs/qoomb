import { Button, Input } from '@qoomb/ui';
import { useCallback, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { useI18nContext } from '../i18n/i18n-react';
import { AuthLayout } from '../layouts/AuthLayout';
import { trpc } from '../lib/trpc/client';

export function ForgotPasswordPage() {
  const { LL } = useI18nContext();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const systemConfig = trpc.auth.getSystemConfig.useQuery();

  const mutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => setSent(true),
    onError: (err) => setError(err.message),
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      mutation.mutate({ email });
    },
    [email, mutation, setError]
  );

  // Redirect if forgot password is disabled
  if (systemConfig.data?.allowForgotPassword === false) {
    return <Navigate to="/login" replace />;
  }

  if (sent) {
    return (
      <AuthLayout
        title={LL.auth.forgotPassword.successTitle()}
        subtitle={LL.auth.forgotPassword.successSubtitle()}
      >
        <div className="mt-6">
          <Button asChild fullWidth variant="outline">
            <Link to="/login">{LL.auth.forgotPassword.backToSignIn()}</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={LL.auth.forgotPassword.title()} subtitle={LL.auth.forgotPassword.subtitle()}>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <Input
          label={LL.auth.forgotPassword.emailLabel()}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" fullWidth isLoading={mutation.isPending} className="mt-2">
          {LL.auth.forgotPassword.sendResetLink()}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-foreground hover:underline">
          {LL.auth.forgotPassword.backToSignIn()}
        </Link>
      </p>
    </AuthLayout>
  );
}
