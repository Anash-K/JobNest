'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { gmailApi, type GmailOAuthConfig, type GmailStatus } from '@/lib/api';
import { CheckCircle, ExternalLink, Link2, Unlink } from 'lucide-react';

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google OAuth (Server Configuration)</CardTitle>
          <CardDescription>
            OAuth credentials are configured via environment variables on the API server — one
            global Google Cloud application for all users.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!oauthConfig && !configError ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : configError ? (
            <p className="text-sm text-destructive">{configError}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {configured ? (
                  <Badge variant="success">OAuth configured</Badge>
                ) : (
                  <Badge variant="destructive">OAuth not configured</Badge>
                )}
                {oauthConfig?.source === 'env' && (
                  <Badge variant="secondary">Loaded from .env</Badge>
                )}
              </div>

              <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-2">
                <p className="font-medium">Admin setup (apps/api/.env)</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>
                    Create OAuth credentials in{' '}
                    <a
                      href="https://console.cloud.google.com/apis/credentials"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline inline-flex items-center gap-1"
                    >
                      Google Cloud Console
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                  <li>Enable the Gmail API for your project</li>
                  <li>
                    Set authorized redirect URI to{' '}
                    <code className="rounded bg-background px-1 text-xs">
                      {oauthConfig?.defaultRedirectUri ??
                        'http://localhost:4000/api/v1/gmail/callback'}
                    </code>
                  </li>
                  <li>
                    Set <code className="text-xs">GOOGLE_CLIENT_ID</code>,{' '}
                    <code className="text-xs">GOOGLE_CLIENT_SECRET</code>, and{' '}
                    <code className="text-xs">GOOGLE_REDIRECT_URI</code> in the API environment
                  </li>
                </ol>
              </div>

              {configured && oauthConfig?.clientId && (
                <p className="text-xs text-muted-foreground font-mono break-all">
                  Client ID: {oauthConfig.clientId}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connect Gmail Account</CardTitle>
          <CardDescription>
            Authorize JobNest to send emails on your behalf. Refresh tokens are encrypted at
            rest; access tokens stay in memory only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status?.connected ? (
            <>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <span className="font-medium">{status.email}</span>
                <Badge variant="success">Connected</Badge>
              </div>
              {status.connectedAt && (
                <p className="text-xs text-muted-foreground">
                  Connected {new Date(status.connectedAt).toLocaleString()}
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={verify} disabled={isPending}>
                  Verify token
                </Button>
                <Button variant="destructive" size="sm" onClick={disconnect} disabled={isPending}>
                  <Unlink className="mr-2 h-4 w-4" />
                  Disconnect
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Scopes: <code className="text-xs">gmail.send</code>,{' '}
                <code className="text-xs">userinfo.email</code>
              </p>
              <Button onClick={connect} disabled={isPending || !configured}>
                <Link2 className="mr-2 h-4 w-4" />
                Connect Gmail
              </Button>
              {!configured && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  OAuth is not configured on the server. Set Google credentials in apps/api/.env
                  and restart the API.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
