import { Button, Input } from '@qoomb/ui';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { AuthLayout } from '../layouts/AuthLayout';
import { useAuth } from '../lib/auth/useAuth';
import { trpc } from '../lib/trpc/client';

export function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('token') ?? '';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminName, setAdminName] = useState('');
  const [hiveName, setHiveName] = useState('');
  const [hiveType, setHiveType] = useState<'family' | 'organization'>('family');
  const [error, setError] = useState('');

  const systemConfig = trpc.auth.getSystemConfig.useQuery();

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      login(
        {
          id: data.user.id,
          email: data.user.email,
          hiveId: data.user.hiveId,
          personId: data.user.personId ?? '',
          hiveName: data.hive.name,
          isSystemAdmin: data.user.isSystemAdmin,
        },
        data.accessToken,
        data.refreshToken
      );
      void navigate('/dashboard', { replace: true });
    },
    onError: (err) => setError(err.message),
  });

  const registerWithInviteMutation = trpc.auth.registerWithInvitation.useMutation({
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
      void navigate('/dashboard', { replace: true });
    },
    onError: (err) => setError(err.message),
  });

  const isPending = registerMutation.isPending || registerWithInviteMutation.isPending;

  // Block if open registration is disabled and no invite token
  const isOpenRegistrationBlocked =
    systemConfig.data?.allowOpenRegistration === false && !inviteToken;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (inviteToken) {
      registerWithInviteMutation.mutate({
        email,
        password,
        adminName,
        hiveName,
        hiveType,
        inviteToken,
      });
    } else {
      registerMutation.mutate({ email, password, adminName, hiveName, hiveType });
    }
  }

  if (systemConfig.isLoading) {
    return (
      <AuthLayout title="Create your hive">
        <div className="mt-8 flex justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AuthLayout>
    );
  }

  if (isOpenRegistrationBlocked) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AuthLayout
      title={inviteToken ? 'Accept invitation' : 'Create your hive'}
      subtitle={
        inviteToken
          ? 'Set up your account to join the hive'
          : 'Start organising your family or team'
      }
    >
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <Input
          label="Your name"
          type="text"
          autoComplete="name"
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
          required
        />
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          helperText="Min. 8 characters with uppercase, number and special character"
        />

        {!inviteToken && (
          <>
            <Input
              label="Hive name"
              type="text"
              placeholder="e.g. Doe Family"
              value={hiveName}
              onChange={(e) => setHiveName(e.target.value)}
              required
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Hive type</label>
              <div className="flex gap-3">
                {(['family', 'organization'] as const).map((type) => (
                  <label
                    key={type}
                    className={`flex flex-1 cursor-pointer items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
                      hiveType === type
                        ? 'border-primary bg-primary text-foreground'
                        : 'border-border bg-card text-foreground hover:bg-muted'
                    }`}
                  >
                    <input
                      type="radio"
                      name="hiveType"
                      value={type}
                      checked={hiveType === type}
                      onChange={() => setHiveType(type)}
                      className="sr-only"
                    />
                    {type}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" fullWidth isLoading={isPending} className="mt-2">
          {inviteToken ? 'Join hive' : 'Create hive'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
