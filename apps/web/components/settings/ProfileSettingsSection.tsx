'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProfile, useUpdateProfile } from '@/hooks/queries/use-profile';
import { updateUser } from '@/lib/auth-client';
import { Skeleton } from '@/components/ui/skeleton';

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(120),
  email: z.string().email(),
  image: z.string().url('Enter a valid image URL').optional().or(z.literal('')),
});

type ProfileForm = z.infer<typeof profileSchema>;

export function ProfileSettingsSection() {
  const { data: profile, isLoading, error } = useProfile();
  const updateProfile = useUpdateProfile();

  const {
    register,
    handleSubmit,
    reset,
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

  const onSubmit = handleSubmit(async (values) => {
    await updateUser({ name: values.name, image: values.image || undefined });
    await updateProfile.mutateAsync({
      name: values.name,
      image: values.image || null,
    });
  });

  if (isLoading) {
    return (
      <Card id="profile">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card id="profile">
        <CardContent className="py-6 text-sm text-destructive">
          Failed to load profile: {error.message}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="profile">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your display name and account identity.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
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

          <div className="space-y-2">
            <Label htmlFor="image">Avatar URL (optional)</Label>
            <Input id="image" placeholder="https://…" {...register('image')} />
            {errors.image && <p className="text-xs text-destructive">{errors.image.message}</p>}
          </div>

          <Button type="submit" disabled={!isDirty || isSubmitting || updateProfile.isPending}>
            {(isSubmitting || updateProfile.isPending) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save profile
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
