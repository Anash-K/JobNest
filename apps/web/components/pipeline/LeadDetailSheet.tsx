'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  applicationsApi,
  emailLogsApi,
  generatedEmailsApi,
  leadsApi,
  pipelineApi,
  type Application,
  type EmailLog,
  type GeneratedEmail,
  type JobLead,
  type PipelineCard,
} from '@/lib/api';
import { PIPELINE_STATUS_LABELS } from '@jobhunter/shared';

interface LeadDetailSheetProps {
  card: PipelineCard;
  onClose: () => void;
  onUpdated: () => void;
}

export function LeadDetailSheet({ card, onClose, onUpdated }: LeadDetailSheetProps) {
  const [lead, setLead] = useState<JobLead | null>(null);
  const [drafts, setDrafts] = useState<GeneratedEmail[]>([]);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [notes, setNotes] = useState(card.notes ?? '');
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const [leadData, draftRes, logRes, appRes] = await Promise.all([
      leadsApi.get(card.id),
      generatedEmailsApi.list({ leadId: card.id, limit: '20' }),
      emailLogsApi.list({ search: card.companyName, limit: '10' }),
      applicationsApi.list({ search: card.companyName, limit: '10' }),
    ]);
    setLead(leadData);
    setNotes(leadData.notes ?? '');
    setDrafts(draftRes.items);
    setLogs(logRes.items.filter((l) => l.jobLead?.id === card.id));
    setApplications(appRes.items.filter((a) => a.jobLead?.id === card.id));
  }, [card.id, card.companyName]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveNotes = () => {
    startTransition(async () => {
      await pipelineApi.updateNotes(card.id, notes);
      onUpdated();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative z-10 flex h-full w-full max-w-lg flex-col border-l bg-background shadow-xl">
        <div className="flex items-start justify-between border-b p-4">
          <div>
            <h2 className="text-lg font-semibold">{card.companyName}</h2>
            <p className="text-sm text-muted-foreground">{card.jobTitle}</p>
            <Badge variant="outline" className="mt-2">
              {PIPELINE_STATUS_LABELS[card.pipelineStatus as keyof typeof PIPELINE_STATUS_LABELS]}
            </Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Tabs.Root defaultValue="info" className="flex flex-1 flex-col overflow-hidden">
          <Tabs.List className="flex border-b px-4 gap-4">
            {['info', 'emails', 'logs', 'application'].map((tab) => (
              <Tabs.Trigger
                key={tab}
                value={tab}
                className="border-b-2 border-transparent py-2 text-sm capitalize data-[state=active]:border-primary data-[state=active]:font-medium"
              >
                {tab === 'info' ? 'Lead Info' : tab === 'emails' ? 'Generated Emails' : tab === 'logs' ? 'Email Logs' : 'Application'}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <div className="flex-1 overflow-y-auto p-4">
            <Tabs.Content value="info" className="space-y-4">
              {lead && (
                <>
                  <div className="grid gap-2 text-sm">
                    <p><span className="text-muted-foreground">Receiver:</span> {lead.receiverName}</p>
                    <p><span className="text-muted-foreground">Email:</span> {lead.receiverEmail}</p>
                    <p><span className="text-muted-foreground">Location:</span> {lead.location}</p>
                    <p><span className="text-muted-foreground">Salary:</span> {lead.salary}</p>
                    {lead.campaign && (
                      <p><span className="text-muted-foreground">Campaign:</span> {lead.campaign.name}</p>
                    )}
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={4}
                      className="mt-1"
                    />
                    <Button className="mt-2" size="sm" onClick={saveNotes} disabled={isPending}>
                      Save notes
                    </Button>
                  </div>
                  <Link href={`/leads`} className="text-sm text-primary underline">
                    Edit on Leads page →
                  </Link>
                </>
              )}
            </Tabs.Content>

            <Tabs.Content value="emails" className="space-y-2">
              {drafts.length === 0 && (
                <p className="text-sm text-muted-foreground">No generated emails for this lead.</p>
              )}
              {drafts.map((d) => (
                <div key={d.id} className="rounded border p-3 text-sm">
                  <p className="font-medium truncate">{d.subject}</p>
                  <div className="mt-1 flex gap-2">
                    <Badge variant="outline">{d.status}</Badge>
                    <Badge variant={d.isValid ? 'success' : 'destructive'}>
                      {d.isValid ? 'Valid' : 'Invalid'}
                    </Badge>
                  </div>
                </div>
              ))}
              <Link
                href={`/generated-emails?leadId=${card.id}`}
                className="text-sm text-primary underline"
              >
                View all drafts →
              </Link>
            </Tabs.Content>

            <Tabs.Content value="logs" className="space-y-2">
              {logs.length === 0 && (
                <p className="text-sm text-muted-foreground">No email logs yet.</p>
              )}
              {logs.map((log) => (
                <div key={log.id} className="rounded border p-3 text-sm">
                  <p className="truncate">{log.subject}</p>
                  <Badge variant={log.status === 'SENT' ? 'success' : log.status === 'FAILED' ? 'destructive' : 'outline'} className="mt-1">
                    {log.status}
                  </Badge>
                  {log.failureMessage && (
                    <p className="mt-1 text-xs text-destructive">{log.failureMessage}</p>
                  )}
                </div>
              ))}
              <Link href="/email-logs" className="text-sm text-primary underline">
                All email logs →
              </Link>
            </Tabs.Content>

            <Tabs.Content value="application" className="space-y-2">
              {applications.length === 0 && (
                <p className="text-sm text-muted-foreground">No application record yet (created on successful send).</p>
              )}
              {applications.map((app) => (
                <div key={app.id} className="rounded border p-3 text-sm">
                  <p className="font-medium">{app.position ?? 'Application'}</p>
                  <p className="text-muted-foreground">Applied {new Date(app.appliedDate).toLocaleDateString()}</p>
                  <Badge variant="outline" className="mt-1">{app.status}</Badge>
                </div>
              ))}
            </Tabs.Content>
          </div>
        </Tabs.Root>
      </div>
    </div>
  );
}
