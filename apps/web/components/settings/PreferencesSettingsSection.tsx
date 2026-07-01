'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useProfile, useUpdateProfile } from '@/hooks/queries/use-profile';
import { useResumes, useTemplates } from '@/hooks/queries/use-settings-data';
import { Skeleton } from '@/components/ui/skeleton';

const preferencesSchema = z.object({
  defaultDelaySeconds: z.coerce.number().int().min(20).max(60),
  defaultResumeId: z.string().optional(),
  defaultTemplateId: z.string().optional(),
});

type PreferencesForm = z.infer<typeof preferencesSchema>;

export function PreferencesSettingsSection() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: resumes, isLoading: resumesLoading } = useResumes();
  const { data: templates, isLoading: templatesLoading } = useTemplates();
  const updateProfile = useUpdateProfile();

  const {
    register,
    handleSubmit,
    reset,
    formState: { isDirty, isSubmitting },
  } = useForm<PreferencesForm>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      defaultDelaySeconds: 25,
      defaultResumeId: '',
      defaultTemplateId: '',
    },
  });

  useEffect(() => {
    if (profile) {
      reset({
        defaultDelaySeconds: profile.defaultDelaySeconds,
        defaultResumeId: profile.defaultResumeId ?? '',
        defaultTemplateId: profile.defaultTemplateId ?? '',
      });
    }
  }, [profile, reset]);

  const onSubmit = handleSubmit(async (values) => {
    await updateProfile.mutateAsync({
      defaultDelaySeconds: values.defaultDelaySeconds,
      defaultResumeId: values.defaultResumeId || null,
      defaultTemplateId: values.defaultTemplateId || null,
    });
  });

  const loading = profileLoading || resumesLoading || templatesLoading;

  if (loading) {
    return (
      <Card id="preferences">
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="preferences">
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>Defaults used by the build and send workflows.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="defaultDelaySeconds">Default send delay (seconds)</Label>
            <input
              id="defaultDelaySeconds"
              type="number"
              min={20}
              max={60}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              {...register('defaultDelaySeconds')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="defaultResumeId">Default resume</Label>
            <select
              id="defaultResumeId"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              {...register('defaultResumeId')}
            >
              <option value="">None</option>
              {resumes?.map((resume) => (
                <option key={resume.id} value={resume.id}>
                  {resume.name} (v{resume.version})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="defaultTemplateId">Default template</Label>
            <select
              id="defaultTemplateId"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              {...register('defaultTemplateId')}
            >
              <option value="">None</option>
              {templates?.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>

          <Button type="submit" disabled={!isDirty || isSubmitting || updateProfile.isPending}>
            {(isSubmitting || updateProfile.isPending) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save preferences
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
