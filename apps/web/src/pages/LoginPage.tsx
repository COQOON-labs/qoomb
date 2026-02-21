import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { loginSchema } from '@qoomb/validators';
import { Button, Input } from '@qoomb/ui';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { z } from 'zod';

import { PassKeyButton } from '../components/auth/PassKeyButton';
import { useI18nContext } from '../i18n/i18n-react';
import { AuthLayout } from '../layouts/AuthLayout';
import { useAuth } from '../lib/auth/useAuth';
import { trpc } from '../lib/trpc/client';

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { LL } = useI18nContext();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/dashboard';

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: standardSchemaResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const emailValue = watch('email');

  const loginMutation = trpc.auth.login.useMutation({
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
      void navigate(from, { replace: true });
    },
    onError: (err) => {
      setError('password', { message: err.message });
    },
  });

  const systemConfig = trpc.auth.getSystemConfig.useQuery();

  const onSubmit = handleSubmit((data) => {
    loginMutation.mutate(data);
  });

  return (
    <AuthLayout title={LL.auth.login.title()} subtitle={LL.auth.login.subtitle()}>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
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
          autoComplete="current-password"
          showPasswordToggle
          error={errors.password?.message}
          {...register('password')}
        />

        {systemConfig.data?.allowForgotPassword && (
          <div className="text-right">
            <Link
              to="/forgot-password"
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              {LL.auth.login.forgotPassword()}
            </Link>
          </div>
        )}

        <Button type="submit" fullWidth isLoading={loginMutation.isPending} className="mt-2">
          {LL.auth.signIn()}
        </Button>
      </form>

      {systemConfig.data?.allowPasskeys && (
        <>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">{LL.common.or()}</span>
            </div>
          </div>
          <PassKeyButton email={emailValue || undefined} redirectTo={from} />
        </>
      )}

      {systemConfig.data?.allowOpenRegistration && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {LL.auth.login.noAccount()}{' '}
          <Link to="/register" className="font-medium text-foreground hover:underline">
            {LL.auth.login.createOne()}
          </Link>
        </p>
      )}
    </AuthLayout>
  );
}
