import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Button, Input } from '@qoomb/ui';
import { requestPasswordResetSchema } from '@qoomb/validators';
import { useForm } from 'react-hook-form';
import { Link, Navigate } from 'react-router-dom';
import type { z } from 'zod';

import { useI18nContext } from '../i18n/i18n-react';
import { AuthLayout } from '../layouts/AuthLayout';
import { trpc } from '../lib/trpc/client';

type ForgotPasswordFormValues = z.infer<typeof requestPasswordResetSchema>;

export function ForgotPasswordPage() {
  const { LL } = useI18nContext();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: standardSchemaResolver(requestPasswordResetSchema),
    defaultValues: { email: '' },
  });

  const systemConfig = trpc.auth.getSystemConfig.useQuery();

  const mutation = trpc.auth.requestPasswordReset.useMutation({
    onError: (err) => setError('email', { message: err.message }),
  });

  const onSubmit = handleSubmit((data) => {
    mutation.mutate(data);
  });

  if (systemConfig.data?.allowForgotPassword === false) {
    return <Navigate to="/login" replace />;
  }

  if (mutation.isSuccess) {
    return (
      <AuthLayout
        title={LL.auth.forgotPassword.successTitle()}
        subtitle={LL.auth.forgotPassword.successSubtitle()}
      >
        <div className="mt-6">
          <Button asChild fullWidth variant="outline">
            <Link to="/login">{LL.auth.backToSignIn()}</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={LL.auth.forgotPassword.title()} subtitle={LL.auth.forgotPassword.subtitle()}>
      <form onSubmit={(e) => void onSubmit(e)} className="mt-6 flex flex-col gap-4">
        <Input
          label={LL.common.emailLabel()}
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        <Button type="submit" fullWidth isLoading={mutation.isPending} className="mt-2">
          {LL.auth.forgotPassword.sendResetLink()}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-foreground hover:underline">
          {LL.auth.backToSignIn()}
        </Link>
      </p>
    </AuthLayout>
  );
}
