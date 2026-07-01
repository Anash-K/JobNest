'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthFormError, AuthFormField } from '@/components/auth/AuthFormFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { signIn } from '@/lib/auth-client';
import { AUTH_ROUTES, DEFAULT_APP_ROUTE } from '@/lib/constants/app';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await signIn.email({
      email: values.email,
      password: values.password,
      callbackURL: DEFAULT_APP_ROUTE,
    });

    if (result.error) {
      setServerError(result.error.message ?? 'Sign in failed. Check your credentials.');
      return;
    }

    router.push(DEFAULT_APP_ROUTE);
    router.refresh();
  });

  return (
    <AuthShell
      title="Sign in"
      description="Access your JobNest outreach workspace."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          No account?{' '}
          <Link href={AUTH_ROUTES.register} className="font-medium text-primary underline">
            Create one
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <AuthFormError message={serverError} />

        <AuthFormField id="email" label="Email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register('email')}
          />
        </AuthFormField>

        <AuthFormField id="password" label="Password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
          />
        </AuthFormField>

        <div className="flex justify-end">
          <Link href={AUTH_ROUTES.forgotPassword} className="text-xs text-primary underline">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
