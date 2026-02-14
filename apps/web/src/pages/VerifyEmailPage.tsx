import { Button } from '@qoomb/ui';
import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';

import { AuthLayout } from '../layouts/AuthLayout';
import { trpc } from '../lib/trpc/client';

type Status = 'verifying' | 'success' | 'error';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<Status>('verifying');
  const [errorMessage, setErrorMessage] = useState('');

  const mutation = trpc.auth.verifyEmail.useMutation({
    onSuccess: () => setStatus('success'),
    onError: (err) => {
      setStatus('error');
      setErrorMessage(err.message);
    },
  });

  useEffect(() => {
    if (!token) return;
    mutation.mutate({ token });
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No token → back to login
  if (!token) return <Navigate to="/login" replace />;

  if (status === 'verifying') {
    return (
      <AuthLayout title="Verifying your email…">
        <div className="mt-8 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AuthLayout>
    );
  }

  if (status === 'success') {
    return (
      <AuthLayout
        title="Email verified"
        subtitle="Your email address has been confirmed. You can now use all features."
      >
        <div className="mt-6">
          <Button asChild fullWidth>
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Verification failed"
      subtitle={errorMessage || 'This link is invalid or has expired.'}
    >
      <div className="mt-6 flex flex-col gap-3">
        <Button asChild fullWidth variant="outline">
          <Link to="/login">Back to sign in</Link>
        </Button>
      </div>
    </AuthLayout>
  );
}
