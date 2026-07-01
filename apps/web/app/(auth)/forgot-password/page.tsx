'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthFormError, AuthFormField } from '@/components/auth/AuthFormFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requestPasswordReset } from '@/lib/auth-client';
import { AUTH_ROUTES } from '@/lib/constants/app';

const forgotSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});

type ForgotForm = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    setSuccessMessage(null);

    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}${AUTH_ROUTES.resetPassword}`
        : AUTH_ROUTES.resetPassword;

    const result = await requestPasswordReset({
      email: values.email,
      redirectTo,
    });

    if (result.error) {
      setServerError(result.error.message ?? 'Unable to send reset email.');
      return;
    }

    setSuccessMessage(
      'If an account exists for that email, a password reset link has been sent. In development, check the API server logs.',
    );
  });

  return (
    <AuthShell
      title="Forgot password"
      description="We will send a secure link to reset your password."
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
        {successMessage ? (
          <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
            {successMessage}
          </div>
        ) : null}

        <AuthFormField id="email" label="Email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register('email')}
          />
        </AuthFormField>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending link…
            </>
          ) : (
            'Send reset link'
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
