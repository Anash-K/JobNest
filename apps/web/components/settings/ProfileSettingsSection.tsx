'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { useProfile, useUpdateProfile } from '@/hooks/queries/use-profile';
import { updateUser } from '@/lib/auth-client';
import { getInitials } from '@/lib/utils';

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(120),
  email: z.string().email(),
  image: z.string().url('Enter a valid image URL').optional().or(z.literal('')),
});

type ProfileForm = z.infer<typeof profileSchema>;

export function ProfileSettingsSection() {
  const { data: profile, isLoading, error } = useProfile();
  const updateProfile = useUpdateProfile();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: '', email: '', image: '' },
  });

  useEffect(() => {
    if (profile) {
      reset({
        name: profile.name,
        email: profile.email,
        image: profile.image ?? '',
      });
    }
  }, [profile, reset]);

  const name = watch('name');
  const image = watch('image');

  const onSubmit = handleSubmit(async (values) => {
    setSaveError(null);
    setSaved(false);
    try {
      await updateUser({ name: values.name, image: values.image || undefined });
      await updateProfile.mutateAsync({
        name: values.name,
        image: values.image || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save profile.');
    }
  });

  const busy = isSubmitting || updateProfile.isPending;

  if (isLoading) {
    return (
      <SettingsSection id="profile" title="Profile" description="Your display name and account identity.">
        <div className="space-y-3">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </SettingsSection>
    );
  }

  if (error) {
    return (
      <SettingsSection id="profile" title="Profile" description="Your display name and account identity.">
        <Alert variant="destructive">Failed to load profile: {error.message}</Alert>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      id="profile"
      title="Profile"
      description="Manage your personal information and account identity."
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {saveError && <Alert variant="destructive">{saveError}</Alert>}

        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-lg font-semibold text-primary-foreground">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="h-full w-full object-cover" />
            ) : (
              getInitials(name || profile?.name || '?')
            )}
          </div>

          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" disabled {...register('email')} />
              <p className="text-xs text-muted-foreground">Email cannot be changed in this release.</p>
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="image">Avatar URL</Label>
          <Input id="image" placeholder="https://…" {...register('image')} />
          {errors.image && <p className="text-xs text-destructive">{errors.image.message}</p>}
          <p className="text-xs text-muted-foreground">Optional — paste a link to an image.</p>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" disabled={!isDirty || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </Button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </span>
          )}
        </div>
      </form>
    </SettingsSection>
  );
}
