import { Button, Input } from '@qoomb/ui';
import { useCallback, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { useI18nContext } from '../i18n/i18n-react';
import { AuthLayout } from '../layouts/AuthLayout';
import { trpc } from '../lib/trpc/client';

export function ResetPasswordPage() {
  const { LL } = useI18nContext();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [formError, setFormError] = useState('');

  const mutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      void navigate('/login', { replace: true });
    },
    onError: (err) => setFormError(err.message),
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setFormError('');
      if (password !== confirm) {
        setFormError(LL.auth.resetPassword.passwordMismatch());
        return;
      }
      mutation.mutate({ token, newPassword: password });
    },
    [LL, password, confirm, token, mutation, setFormError]
  );

  // No token → back to login
  if (!token) return <Navigate to="/login" replace />;

  return (
    <AuthLayout title={LL.auth.resetPassword.title()} subtitle={LL.auth.resetPassword.subtitle()}>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <Input
          label={LL.auth.resetPassword.newPasswordLabel()}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          showPasswordToggle
          helperText={LL.auth.resetPassword.passwordHint()}
        />
        <Input
          label={LL.auth.resetPassword.confirmPasswordLabel()}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          showPasswordToggle
          error={formError || undefined}
        />

        <Button type="submit" fullWidth isLoading={mutation.isPending} className="mt-2">
          {LL.auth.resetPassword.setNewPassword()}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-foreground hover:underline">
          {LL.auth.resetPassword.backToSignIn()}
        </Link>
      </p>
    </AuthLayout>
  );
}
