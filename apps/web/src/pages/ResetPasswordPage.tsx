import { Button, Input } from '@qoomb/ui';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { AuthLayout } from '../layouts/AuthLayout';
import { trpc } from '../lib/trpc/client';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [formError, setFormError] = useState('');

  // No token → back to login
  if (!token) return <Navigate to="/login" replace />;

  const mutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      navigate('/login', { replace: true });
    },
    onError: (err) => setFormError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (password !== confirm) {
      setFormError('Passwords do not match.');
      return;
    }
    mutation.mutate({ token, newPassword: password });
  }

  return (
    <AuthLayout title="Reset password" subtitle="Choose a new password for your account">
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          helperText="Min. 8 characters with uppercase, number and special character"
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          error={formError || undefined}
        />

        <Button type="submit" fullWidth isLoading={mutation.isPending} className="mt-2">
          Set new password
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-foreground hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
