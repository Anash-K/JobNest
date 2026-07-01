'use client';

import { Suspense, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  bulkSendApi,
  generatedEmailsApi,
  gmailApi,
  type BulkSendProgress,
  type GeneratedEmail,
} from '@/lib/api';
import { Mail, RotateCcw, Send } from 'lucide-react';

import { ACTIVE_BULK_SEND_KEY } from '@/lib/constants/app';

function SendPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadIdFilter = searchParams.get('leadId') ?? undefined;
  const buildBatchIdParam = searchParams.get('buildBatchId') ?? undefined;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<GeneratedEmail[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [delaySeconds, setDelaySeconds] = useState(25);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [validation, setValidation] = useState<{
    count: number;
    estimatedMinutes: number;
    dailySentCount: number;
    dailyWarning: boolean;
    dailyThreshold: number;
  } | null>(null);
  const [progress, setProgress] = useState<BulkSendProgress | null>(null);
  const [activeBulkSendId, setActiveBulkSendId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendAllApproved = Boolean(buildBatchIdParam);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const load = useCallback(async () => {
    try {
      if (sendAllApproved && buildBatchIdParam) {
        const batchDrafts = await generatedEmailsApi.listByBatch(buildBatchIdParam);
        const approved = batchDrafts.filter((d) => d.status === 'APPROVED' && d.isValid);
        setDrafts(approved);
        setSelected(new Set(approved.map((d) => d.id)));
      } else {
        const params: Record<string, string> = { status: 'APPROVED', limit: '100' };
        if (leadIdFilter) params.leadId = leadIdFilter;
        const draftRes = await generatedEmailsApi.list(params);
        setDrafts(draftRes.items);
        setSelected(new Set(draftRes.items.map((d) => d.id)));
      }

      const gmail = await gmailApi.getStatus();
      setGmailConnected(gmail.connected);
      setGmailEmail(gmail.email ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load drafts');
    } finally {
      setLoading(false);
    }
  }, [leadIdFilter, buildBatchIdParam, sendAllApproved]);

  const pollProgress = useCallback(
    (bulkSendId: string) => {
      stopPolling();
      setActiveBulkSendId(bulkSendId);
      sessionStorage.setItem(ACTIVE_BULK_SEND_KEY, bulkSendId);

      const tick = async () => {
        try {
          const status = await bulkSendApi.getStatus(bulkSendId);
          setProgress(status);
          if (status.status === 'completed') {
            stopPolling();
            sessionStorage.removeItem(ACTIVE_BULK_SEND_KEY);
            await load();
          }
        } catch {
          stopPolling();
        }
      };

      void tick();
      pollRef.current = setInterval(() => void tick(), 2000);
    },
    [stopPolling, load],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const saved = sessionStorage.getItem(ACTIVE_BULK_SEND_KEY);
    if (saved) {
      setStep(3);
      pollProgress(saved);
    }
    return () => stopPolling();
  }, [pollProgress, stopPolling]);

  const toggle = (id: string) => {
    if (sendAllApproved) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const validate = () => {
    startTransition(async () => {
      try {
        setError(null);
        const payload = sendAllApproved
          ? { buildBatchId: buildBatchIdParam, sendAllApproved: true }
          : { generatedEmailIds: [...selected] };

        const result = await bulkSendApi.validate(payload);
        setValidation(result);
        setDelaySeconds(result.delaySeconds);
        setStep(2);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Validation failed');
      }
    });
  };

  const send = () => {
    startTransition(async () => {
      try {
        setError(null);
        const payload = sendAllApproved
          ? { buildBatchId: buildBatchIdParam, sendAllApproved: true, delaySeconds }
          : { generatedEmailIds: [...selected], delaySeconds };

        const result = await bulkSendApi.start(payload);
        setStep(3);
        pollProgress(result.bulkSendId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Send failed');
      }
    });
  };

  const retryFailed = () => {
    if (!activeBulkSendId) return;
    startTransition(async () => {
      try {
        setError(null);
        const result = await bulkSendApi.retryFailed(activeBulkSendId);
        pollProgress(result.bulkSendId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Retry failed');
      }
    });
  };

  const progressPct =
    progress && progress.total > 0
      ? Math.round(((progress.sent + progress.failed) / progress.total) * 100)
      : 0;

  if (loading) {
    return (
      <>
        <PageHeader title="Send" description="Send approved drafts via Gmail." />
        <div className="mx-auto max-w-3xl space-y-4 p-8">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Send" description="Sequential Gmail sending with delay, retries, and progress tracking." />

      <div className="mx-auto max-w-3xl space-y-6 p-8">
        {!gmailConnected && (
          <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40">
            <CardContent className="flex items-center justify-between p-4">
              <p className="text-sm">Gmail is not connected.</p>
              <Link href="/settings">
                <Button size="sm" variant="outline">
                  <Mail className="mr-2 h-4 w-4" />
                  Connect Gmail
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {gmailConnected && gmailEmail && (
          <p className="text-sm text-muted-foreground">Sending as {gmailEmail}</p>
        )}

        {sendAllApproved && buildBatchIdParam && (
          <Badge variant="secondary">Batch mode — all approved drafts from build</Badge>
        )}

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Select Approved Drafts ({selected.size})</CardTitle>
            </CardHeader>
            <CardContent className="max-h-96 space-y-2 overflow-y-auto">
              {drafts.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No approved drafts.{' '}
                  <Link href="/generated-emails" className="text-primary underline">
                    Review and approve
                  </Link>{' '}
                  first.
                </p>
              )}
              {drafts.map((d) => (
                <label
                  key={d.id}
                  className="flex cursor-pointer items-center gap-3 rounded border p-3 hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(d.id)}
                    onChange={() => toggle(d.id)}
                    disabled={sendAllApproved}
                  />
                  <div className="min-w-0">
                    <p className="font-medium">{d.lead?.companyName}</p>
                    <p className="truncate text-xs text-muted-foreground">{d.subject}</p>
                    <p className="text-xs text-muted-foreground">{d.recipientEmail}</p>
                  </div>
                  <Badge variant="success" className="ml-auto shrink-0">
                    APPROVED
                  </Badge>
                </label>
              ))}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                className="mt-4"
                disabled={selected.size === 0 || !gmailConnected || isPending}
                onClick={validate}
              >
                Next
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 2 && validation && (
          <Card>
            <CardHeader>
              <CardTitle>Confirm & Send</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Sending <strong>{validation.count}</strong> approved email
                {validation.count !== 1 ? 's' : ''} sequentially.
              </p>
              <p className="text-sm text-muted-foreground">
                Estimated time: ~{validation.estimatedMinutes} min ({delaySeconds}s delay + jitter
                between sends)
              </p>
              <p className="text-sm text-muted-foreground">
                Sent today: {validation.dailySentCount} / {validation.dailyThreshold}
              </p>
              {validation.dailyWarning && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  This batch may exceed the recommended daily send threshold. Gmail may rate-limit
                  high-volume sending.
                </p>
              )}
              <div>
                <Label>Delay between sends (seconds)</Label>
                <Input
                  type="number"
                  min={20}
                  max={60}
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(Number(e.target.value))}
                  className="mt-1 max-w-[120px]"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button onClick={send} disabled={isPending}>
                  <Send className="mr-2 h-4 w-4" />
                  Send {validation.count} Email{validation.count !== 1 ? 's' : ''}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && progress && (
          <Card>
            <CardHeader>
              <CardTitle>
                {progress.status === 'completed' ? 'Send Complete' : 'Sending…'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <Badge variant="success">Sent: {progress.sent}</Badge>
                <Badge variant="destructive">Failed: {progress.failed}</Badge>
                <Badge variant="outline">Pending: {progress.pending}</Badge>
                <Badge variant="secondary">Total: {progress.total}</Badge>
              </div>
              {progress.currentEmail && (
                <p className="text-xs text-muted-foreground">
                  Sending to {progress.currentEmail}
                  {progress.currentCompany ? ` (${progress.currentCompany})` : ''}…
                </p>
              )}
              {progress.errors.length > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <p className="mb-2 text-sm font-medium text-destructive">Failures</p>
                  <ul className="max-h-32 space-y-1 overflow-y-auto text-xs">
                    {progress.errors.map((e) => (
                      <li key={e.generatedEmailId} className="text-muted-foreground">
                        {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {progress.status === 'completed' && (
                <div className="flex flex-wrap gap-2">
                  {progress.failed > 0 && (
                    <Button onClick={retryFailed} disabled={isPending}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Retry Failed ({progress.failed})
                    </Button>
                  )}
                  <Button onClick={() => router.push('/pipeline')}>View Pipeline</Button>
                  <Button variant="outline" onClick={() => router.push('/email-logs')}>
                    Email Logs
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

export default function SendPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading…</div>}>
      <SendPageContent />
    </Suspense>
  );
}
