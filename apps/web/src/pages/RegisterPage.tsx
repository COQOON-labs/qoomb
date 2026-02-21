import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Button, Input } from '@qoomb/ui';
import { registerSchema } from '@qoomb/validators';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import type { z } from 'zod';

import { useI18nContext } from '../i18n/i18n-react';
import { AuthLayout } from '../layouts/AuthLayout';
import { useAuth } from '../lib/auth/useAuth';
import { trpc } from '../lib/trpc/client';

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const { LL } = useI18nContext();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('token') ?? '';

  const systemConfig = trpc.auth.getSystemConfig.useQuery();

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: standardSchemaResolver(registerSchema),
    defaultValues: {
      adminName: '',
      email: '',
      password: '',
      hiveName: '',
      hiveType: 'family',
    },
  });

  const hiveType = watch('hiveType');

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
          locale: data.locale,
        },
        data.accessToken,
        data.refreshToken
      );
      void navigate('/dashboard', { replace: true });
    },
    onError: (err) => setError('root', { message: err.message }),
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
          locale: data.locale,
        },
        data.accessToken,
        data.refreshToken
      );
      void navigate('/dashboard', { replace: true });
    },
    onError: (err) => setError('root', { message: err.message }),
  });

  const isPending = registerMutation.isPending || registerWithInviteMutation.isPending;

  const isOpenRegistrationBlocked =
    systemConfig.data?.allowOpenRegistration === false && !inviteToken;

  const onSubmit = handleSubmit((data) => {
    if (inviteToken) {
      registerWithInviteMutation.mutate({ ...data, inviteToken });
    } else {
      registerMutation.mutate(data);
    }
  });

  if (systemConfig.isLoading) {
    return (
      <AuthLayout title={LL.auth.register.title()}>
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
      title={inviteToken ? LL.auth.register.titleInvite() : LL.auth.register.title()}
      subtitle={inviteToken ? LL.auth.register.subtitleInvite() : LL.auth.register.subtitle()}
    >
      <form onSubmit={(e) => void onSubmit(e)} className="mt-6 flex flex-col gap-4">
        <Input
          label={LL.auth.register.nameLabel()}
          type="text"
          autoComplete="name"
          error={errors.adminName?.message}
          {...register('adminName')}
        />
        <Input
          label={LL.common.emailLabel()}
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label={LL.common.passwordLabel()}
          type="password"
          autoComplete="new-password"
          showPasswordToggle
          helperText={LL.common.passwordHint()}
          error={errors.password?.message}
          {...register('password')}
        />

        {!inviteToken && (
          <>
            <Input
              label={LL.auth.register.hiveNameLabel()}
              type="text"
              placeholder={LL.auth.register.hiveNamePlaceholder()}
              error={errors.hiveName?.message}
              {...register('hiveName')}
            />

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">
                {LL.auth.register.hiveTypeLabel()}
              </label>
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
                      value={type}
                      className="sr-only"
                      {...register('hiveType')}
                    />
                    {type}
                  </label>
                ))}
              </div>
              {errors.hiveType && (
                <p className="text-sm text-destructive">{errors.hiveType.message}</p>
              )}
            </div>
          </>
        )}

        {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}

        <Button type="submit" fullWidth isLoading={isPending} className="mt-2">
          {inviteToken ? LL.auth.register.joinHive() : LL.auth.register.createHive()}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {LL.auth.register.alreadyHaveAccount()}{' '}
        <Link to="/login" className="font-medium text-foreground hover:underline">
          {LL.auth.signIn()}
        </Link>
      </p>
    </AuthLayout>
  );
}
