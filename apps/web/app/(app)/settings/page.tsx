'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { SettingsNav, SETTINGS_SECTIONS, type SettingsSectionId } from '@/components/settings/SettingsNav';
import { SettingsSection } from '@/components/settings/SettingsSection';
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
  const [messageVariant, setMessageVariant] = useState<'success' | 'destructive'>('success');
  const [activeTab, setActiveTab] = useState<SettingsSectionId>(() => {
    const tab = searchParams.get('tab');
    if (tab && SETTINGS_SECTIONS.some((section) => section.id === tab)) {
      return tab as SettingsSectionId;
    }
    return searchParams.get('gmail') ? 'integrations' : 'profile';
  });

  const refreshGmail = useCallback(() => {
    void refetch();
    void queryClient.invalidateQueries({ queryKey: queryKeys.gmailStatus });
  }, [refetch, queryClient]);

  useEffect(() => {
    const gmail = searchParams.get('gmail');
    const email = searchParams.get('email');
    const errMsg = searchParams.get('message');

    if (gmail === 'connected' && email) {
      setMessageVariant('success');
      setMessage(`Gmail connected: ${decodeURIComponent(email)}`);
      refreshGmail();
    } else if (gmail === 'error') {
      setMessageVariant('destructive');
      setMessage(`Connection failed: ${errMsg ? decodeURIComponent(errMsg) : 'unknown error'}`);
    }
  }, [searchParams, refreshGmail]);

  const showMessage = (text: string) => {
    setMessageVariant('success');
    setMessage(text);
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your profile, security, integrations, and preferences."
      />
      <div className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 lg:px-10">
        <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
          <SettingsNav active={activeTab} onChange={setActiveTab} />

          <div className="mt-6 min-w-0 space-y-10 lg:mt-0">
            {message && (
              <Alert variant={messageVariant}>
                <div className="flex items-center justify-between gap-3">
                  <span>{message}</span>
                  <button
                    type="button"
                    onClick={() => setMessage(null)}
                    aria-label="Dismiss message"
                    className="shrink-0 rounded-md p-0.5 opacity-70 hover:opacity-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </Alert>
            )}

            {activeTab === 'profile' && <ProfileSettingsSection />}
            {activeTab === 'security' && <SecuritySettingsSection />}

            {activeTab === 'integrations' && (
              <GmailOAuthPanel
                status={gmailStatus ?? null}
                onStatusChange={refreshGmail}
                onMessage={showMessage}
              />
            )}

            {activeTab === 'preferences' && <PreferencesSettingsSection />}

            {activeTab === 'appearance' && (
              <SettingsSection
                id="appearance"
                title="Appearance"
                description="Choose how JobNest looks on this device."
              >
                <ThemeToggle className="max-w-sm" />
              </SettingsSection>
            )}

            {activeTab === 'sessions' && <SessionsSettingsSection />}
          </div>
        </div>
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
