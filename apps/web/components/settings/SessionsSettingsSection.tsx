'use client';

import { Loader2, LogOut, Monitor } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsSection } from '@/components/settings/SettingsSection';
import {
  useRevokeOtherSessions,
  useRevokeSession,
  useSessions,
} from '@/hooks/queries/use-profile';
import { useAuth } from '@/hooks/use-auth';
import { revokeOtherSessions } from '@/lib/auth-client';

export function SessionsSettingsSection() {
  const { logout } = useAuth();
  const { data: sessions, isLoading, error } = useSessions();
  const revokeSession = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();

  const handleRevokeOthers = async () => {
    await revokeOtherSessions();
    await revokeOthers.mutateAsync();
  };

  if (isLoading) {
    return (
      <SettingsSection id="sessions" title="Sessions" description="Manage active sign-in sessions across devices.">
        <Skeleton className="h-20 w-full" />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      id="sessions"
      title="Sessions"
      description="Manage active sign-in sessions across devices."
    >
      <div className="space-y-4">
        {error && <Alert variant="destructive">{error.message}</Alert>}

        {sessions?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active sessions found.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {sessions?.map((session) => (
              <div key={session.id} className="flex items-start justify-between gap-3 p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">Session</p>
                      {session.isCurrent && <Badge variant="secondary">Current</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Expires {new Date(session.expiresAt).toLocaleString()}
                    </p>
                    {session.userAgent && (
                      <p className="mt-1 truncate text-xs text-muted-foreground">{session.userAgent}</p>
                    )}
                  </div>
                </div>
                {!session.isCurrent && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={revokeSession.isPending}
                    onClick={() => revokeSession.mutate(session.id)}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            variant="outline"
            disabled={revokeOthers.isPending}
            onClick={() => void handleRevokeOthers()}
          >
            {revokeOthers.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign out other devices
          </Button>
          <Button variant="outline" onClick={() => void logout()}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
