import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Button, Input } from '@qoomb/ui';
import { passwordSchema } from '@qoomb/validators';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { useI18nContext } from '../i18n/i18n-react';
import { AuthLayout } from '../layouts/AuthLayout';
import { trpc } from '../lib/trpc/client';

const resetPasswordFormSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>;

export function ResetPasswordPage() {
  const { LL } = useI18nContext();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: standardSchemaResolver(resetPasswordFormSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const mutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      void navigate('/login', { replace: true });
    },
    onError: (err) => setError('root', { message: err.message }),
  });

  if (!token) return <Navigate to="/login" replace />;

  const onSubmit = handleSubmit(({ password }) => {
    mutation.mutate({ token, newPassword: password });
  });

  return (
    <AuthLayout title={LL.auth.resetPassword.title()} subtitle={LL.auth.resetPassword.subtitle()}>
      <form onSubmit={(e) => void onSubmit(e)} className="mt-6 flex flex-col gap-4">
        <Input
          label={LL.auth.resetPassword.newPasswordLabel()}
          type="password"
          autoComplete="new-password"
          showPasswordToggle
          helperText={LL.common.passwordHint()}
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label={LL.auth.resetPassword.confirmPasswordLabel()}
          type="password"
          autoComplete="new-password"
          showPasswordToggle
          error={errors.confirmPassword?.message ?? errors.root?.message}
          {...register('confirmPassword')}
        />

        <Button type="submit" fullWidth isLoading={mutation.isPending} className="mt-2">
          {LL.auth.resetPassword.setNewPassword()}
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
