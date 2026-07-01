'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { GmailOAuthPanel } from '@/components/settings/GmailOAuthPanel';
import { ProfileSettingsSection } from '@/components/settings/ProfileSettingsSection';
import { SecuritySettingsSection } from '@/components/settings/SecuritySettingsSection';
import { PreferencesSettingsSection } from '@/components/settings/PreferencesSettingsSection';
import { SessionsSettingsSection } from '@/components/settings/SessionsSettingsSection';
import { useGmailStatus } from '@/hooks/queries/use-gmail';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-client';

function SettingsContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: gmailStatus, refetch } = useGmailStatus();
  const [message, setMessage] = useState<string | null>(null);

  const refreshGmail = () => {
    void refetch();
    void queryClient.invalidateQueries({ queryKey: queryKeys.gmailStatus });
  };

  useEffect(() => {
    const gmail = searchParams.get('gmail');
    const email = searchParams.get('email');
    const errMsg = searchParams.get('message');

    if (gmail === 'connected' && email) {
      setMessage(`Gmail connected: ${decodeURIComponent(email)}`);
      refreshGmail();
    } else if (gmail === 'error') {
      setMessage(`Connection failed: ${errMsg ? decodeURIComponent(errMsg) : 'unknown error'}`);
    }
  }, [searchParams]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Profile, security, Gmail, preferences, and sessions."
      />
      <div className="mx-auto max-w-2xl space-y-6 p-8">
        <ProfileSettingsSection />
        <SecuritySettingsSection />

        <GmailOAuthPanel
          status={gmailStatus ?? null}
          onStatusChange={refreshGmail}
          onMessage={setMessage}
        />

        <PreferencesSettingsSection />

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <ThemeToggle />
          </CardContent>
        </Card>

        <SessionsSettingsSection />

        {message && (
          <p className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">{message}</p>
        )}
      </div>
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading…</div>}>
      <SettingsContent />
    </Suspense>
  );
}
