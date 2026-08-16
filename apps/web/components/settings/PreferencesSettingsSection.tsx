'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, ChevronDown, Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { useProfile, useUpdateProfile } from '@/hooks/queries/use-profile';
import { useResumes, useTemplates } from '@/hooks/queries/use-settings-data';

const preferencesSchema = z.object({
  defaultDelaySeconds: z.coerce.number().int().min(5).max(60),
  defaultResumeId: z.string().optional(),
  defaultTemplateId: z.string().optional(),
});

type PreferencesForm = z.infer<typeof preferencesSchema>;

const selectClassName =
  'flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

export function PreferencesSettingsSection() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: resumes, isLoading: resumesLoading } = useResumes();
  const { data: templates, isLoading: templatesLoading } = useTemplates();
  const updateProfile = useUpdateProfile();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    setSaveError(null);
    setSaved(false);
    try {
      await updateProfile.mutateAsync({
        defaultDelaySeconds: values.defaultDelaySeconds,
        defaultResumeId: values.defaultResumeId || null,
        defaultTemplateId: values.defaultTemplateId || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save preferences.');
    }
  });

  const loading = profileLoading || resumesLoading || templatesLoading;
  const busy = isSubmitting || updateProfile.isPending;

  if (loading) {
    return (
      <SettingsSection
        id="preferences"
        title="Preferences"
        description="Defaults used by the build and send workflows."
      >
        <Skeleton className="h-24 w-full" />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      id="preferences"
      title="Preferences"
      description="Defaults used by the build and send workflows."
    >
      <form onSubmit={onSubmit} className="max-w-sm space-y-5">
        {saveError && <Alert variant="destructive">{saveError}</Alert>}

        <div className="space-y-2">
          <Label htmlFor="defaultDelaySeconds">Default send delay (seconds)</Label>
          <Input
            id="defaultDelaySeconds"
            type="number"
            min={5}
            max={60}
            {...register('defaultDelaySeconds')}
          />
          <p className="text-xs text-muted-foreground">Between 5 and 60 seconds.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="defaultResumeId">Default resume</Label>
          <div className="relative">
            <select
              id="defaultResumeId"
              className={selectClassName}
              {...register('defaultResumeId')}
            >
              <option value="">None</option>
              {resumes?.map((resume) => (
                <option key={resume.id} value={resume.id}>
                  {resume.name} (v{resume.version})
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="defaultTemplateId">Default template</Label>
          <div className="relative">
            <select
              id="defaultTemplateId"
              className={selectClassName}
              {...register('defaultTemplateId')}
            >
              <option value="">None</option>
              {templates?.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" disabled={!isDirty || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Save preferences
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
