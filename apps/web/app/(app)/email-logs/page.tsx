'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { emailLogsApi, type EmailLog } from '@/lib/api';

function EmailLogsContent() {
  const searchParams = useSearchParams();
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');

  const load = useCallback(async () => {
    const params: Record<string, string> = { limit: '50' };
    if (search.trim()) params.search = search.trim();
    if (statusFilter) params.status = statusFilter;
    const result = await emailLogsApi.list(params);
    setLogs(result.items);
  }, [search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <>
      <PageHeader title="Email Logs" description="Send history and failure tracking." />
      <div className="space-y-4 p-8">
        <div className="flex flex-wrap gap-3">
          <Input
            placeholder="Search recipient, subject, company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <select
            className="h-10 rounded-md border px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
            <option value="PENDING">Pending</option>
            <option value="SENDING">Sending</option>
          </select>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Logs ({logs.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="rounded border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{log.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.recipientEmail}
                      {log.jobLead && ` · ${log.jobLead.companyName}`}
                    </p>
                  </div>
                  <Badge
                    variant={
                      log.status === 'SENT'
                        ? 'success'
                        : log.status === 'FAILED'
                          ? 'destructive'
                          : 'outline'
                    }
                  >
                    {log.status}
                  </Badge>
                </div>
                {log.failureMessage && (
                  <p className="mt-2 text-xs text-destructive">{log.failureMessage}</p>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(log.createdAt).toLocaleString()}
                  {log.sentAt && ` · Sent ${new Date(log.sentAt).toLocaleString()}`}
                </p>
              </div>
            ))}
            {logs.length === 0 && (
              <p className="text-sm text-muted-foreground">No email logs yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function EmailLogsPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading…</div>}>
      <EmailLogsContent />
    </Suspense>
  );
}
