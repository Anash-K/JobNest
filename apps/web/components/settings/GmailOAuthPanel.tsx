'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { gmailApi, type GmailOAuthConfig, type GmailStatus } from '@/lib/api';
import { CheckCircle2, ExternalLink, Link2, Mail, Unlink } from 'lucide-react';

interface GmailOAuthPanelProps {
  status: GmailStatus | null;
  onStatusChange: () => void;
  onMessage: (message: string) => void;
}

export function GmailOAuthPanel({ status, onStatusChange, onMessage }: GmailOAuthPanelProps) {
  const [oauthConfig, setOauthConfig] = useState<GmailOAuthConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadConfig = useCallback(async () => {
    try {
      setOauthConfig(await gmailApi.getOAuthConfig());
      setConfigError(null);
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : 'Failed to load OAuth config');
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const connect = () => {
    startTransition(async () => {
      try {
        const { url } = await gmailApi.getAuthUrl();
        window.location.href = url;
      } catch (e) {
        onMessage(e instanceof Error ? e.message : 'Failed to start OAuth');
      }
    });
  };

  const disconnect = () => {
    startTransition(async () => {
      try {
        await gmailApi.disconnect();
        onMessage('Gmail disconnected');
        onStatusChange();
      } catch (e) {
        onMessage(e instanceof Error ? e.message : 'Failed to disconnect Gmail');
      }
    });
  };

  const verify = () => {
    startTransition(async () => {
      try {
        const result = await gmailApi.verify();
        onMessage(result.valid ? 'Token verified successfully' : 'Token invalid — reconnect Gmail');
        onStatusChange();
      } catch (e) {
        onMessage(e instanceof Error ? e.message : 'Verification failed');
      }
    });
  };

  const configured = oauthConfig?.configured ?? false;
  const connected = status?.connected ?? false;

  return (
    <SettingsSection
      id="integrations"
      title="Integrations"
      description="Connect third-party services to unlock automation features."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Mail className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium">Google</p>
                {connected ? (
                  <Badge variant="success">Connected</Badge>
                ) : (
                  <Badge variant="secondary">Not connected</Badge>
                )}
              </div>
              {connected ? (
                <>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{status?.email}</p>
                  {status?.connectedAt && (
                    <p className="text-xs text-muted-foreground">
                      Connected {new Date(status.connectedAt).toLocaleString()}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Authorize JobNest to send emails on your behalf. Scopes:{' '}
                  <code className="text-xs">gmail.send</code>,{' '}
                  <code className="text-xs">userinfo.email</code>
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            {connected ? (
              <>
                <Button variant="outline" size="sm" onClick={verify} disabled={isPending}>
                  Verify token
                </Button>
                <Button variant="outline" size="sm" onClick={disconnect} disabled={isPending}>
                  <Unlink className="h-4 w-4" />
                  Disconnect
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={connect} disabled={isPending || !configured}>
                <Link2 className="h-4 w-4" />
                Connect Gmail
              </Button>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Refresh tokens are encrypted at rest; access tokens stay in memory only.
        </p>

        {!oauthConfig && !configError ? (
          <Skeleton className="h-4 w-2/3" />
        ) : configError ? (
          <Alert variant="destructive">{configError}</Alert>
        ) : !configured ? (
          <>
            <Alert variant="warning">
              Google OAuth is not configured on the server. Set Google credentials in{' '}
              <code className="text-xs">apps/api/.env</code> and restart the API.
            </Alert>

            <Separator />

            <div className="space-y-2 text-sm">
              <p className="font-medium">Admin setup (apps/api/.env)</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>
                  Create OAuth credentials in{' '}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary underline"
                  >
                    Google Cloud Console
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>Enable the Gmail API for your project</li>
                <li>
                  Set authorized redirect URI to{' '}
                  <code className="rounded bg-muted px-1 text-xs">
                    {oauthConfig?.defaultRedirectUri ?? 'http://localhost:4000/api/v1/gmail/callback'}
                  </code>
                </li>
                <li>
                  Set <code className="text-xs">GOOGLE_CLIENT_ID</code>,{' '}
                  <code className="text-xs">GOOGLE_CLIENT_SECRET</code>, and{' '}
                  <code className="text-xs">GOOGLE_REDIRECT_URI</code> in the API environment
                </li>
              </ol>
            </div>
          </>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            Google OAuth is managed by the JobNest server configuration. You don&apos;t need to
            enter credentials here.
            {oauthConfig?.clientId && (
              <span className="ml-1 truncate font-mono">Client ID: {oauthConfig.clientId}</span>
            )}
          </p>
        )}
      </div>
    </SettingsSection>
  );
}
