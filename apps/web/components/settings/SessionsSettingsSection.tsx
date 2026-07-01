'use client';

import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useRevokeOtherSessions,
  useRevokeSession,
  useSessions,
} from '@/hooks/queries/use-profile';
import { useAuth } from '@/hooks/use-auth';
import { revokeOtherSessions } from '@/lib/auth-client';
import { Skeleton } from '@/components/ui/skeleton';

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
      <Card id="sessions">
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="sessions">
      <CardHeader>
        <CardTitle>Account sessions</CardTitle>
        <CardDescription>Manage active sign-in sessions across devices.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error.message}</p>}

        <div className="space-y-2">
          {sessions?.map((session) => (
            <div
              key={session.id}
              className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium">Session</p>
                  {session.isCurrent && <Badge variant="secondary">Current</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  Expires {new Date(session.expiresAt).toLocaleString()}
                </p>
                {session.userAgent && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">{session.userAgent}</p>
                )}
              </div>
              {!session.isCurrent && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={revokeSession.isPending}
                  onClick={() => revokeSession.mutate(session.id)}
                >
                  Revoke
                </Button>
              )}
            </div>
          ))}
          {sessions?.length === 0 && (
            <p className="text-sm text-muted-foreground">No active sessions found.</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={revokeOthers.isPending}
            onClick={() => void handleRevokeOthers()}
          >
            {revokeOthers.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign out other devices
          </Button>
          <Button variant="destructive" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
