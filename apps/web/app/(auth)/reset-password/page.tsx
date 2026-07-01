'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthFormError, AuthFormField } from '@/components/auth/AuthFormFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { resetPassword } from '@/lib/auth-client';
import { AUTH_ROUTES } from '@/lib/constants/app';

const resetSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ResetForm = z.infer<typeof resetSchema>;

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const tokenError = useMemo(() => {
    if (!token) return 'Reset token is missing or invalid. Request a new password reset link.';
    return null;
  }, [token]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (!token) return;
    setServerError(null);

    const result = await resetPassword({
      newPassword: values.password,
      token,
    });

    if (result.error) {
      setServerError(result.error.message ?? 'Unable to reset password.');
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push(AUTH_ROUTES.login), 1500);
  });

  if (tokenError) {
    return (
      <AuthShell
        title="Invalid reset link"
        description={tokenError}
        footer={
          <p className="text-center text-sm text-muted-foreground">
            <Link href={AUTH_ROUTES.forgotPassword} className="font-medium text-primary underline">
              Request a new link
            </Link>
          </p>
        }
      >
        <AuthFormError message={tokenError} />
      </AuthShell>
    );
  }

  if (success) {
    return (
      <AuthShell title="Password updated" description="Redirecting you to sign in…">
        <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          Your password has been reset successfully.
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset password"
      description="Choose a new password for your JobNest account."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          <Link href={AUTH_ROUTES.login} className="font-medium text-primary underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <AuthFormError message={serverError} />

        <AuthFormField id="password" label="New password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register('password')}
          />
        </AuthFormField>

        <AuthFormField
          id="confirmPassword"
          label="Confirm password"
          error={errors.confirmPassword?.message}
        >
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            {...register('confirmPassword')}
          />
        </AuthFormField>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating password…
            </>
          ) : (
            'Reset password'
          )}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
