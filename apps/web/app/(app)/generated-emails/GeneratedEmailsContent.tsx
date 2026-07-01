'use client';

import Link from 'next/link';
import { useCallback, useEffect, useOptimistic, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TiptapEditor } from '@/components/templates/TiptapEditor';
import { DraftHtmlPreview } from '@/components/build/DraftHtmlPreview';
import { generatedEmailsApi, type GeneratedEmail } from '@/lib/api';
import { Check, ChevronLeft, ChevronRight, Pencil, RotateCcw, Send, Trash2, X } from 'lucide-react';

type DraftAction =
  | { type: 'approve'; id: string }
  | { type: 'approveAllValid' }
  | { type: 'delete'; id: string }
  | { type: 'update'; id: string; subject: string; bodyHtml: string };

function applyOptimistic(drafts: GeneratedEmail[], action: DraftAction): GeneratedEmail[] {
  switch (action.type) {
    case 'approve':
      return drafts.map((d) =>
        d.id === action.id ? { ...d, status: 'APPROVED', approvedAt: new Date().toISOString() } : d,
      );
    case 'approveAllValid':
      return drafts.map((d) =>
        d.status === 'DRAFT' && d.isValid
          ? { ...d, status: 'APPROVED', approvedAt: new Date().toISOString() }
          : d,
      );
    case 'delete':
      return drafts.filter((d) => d.id !== action.id);
    case 'update':
      return drafts.map((d) =>
        d.id === action.id ? { ...d, subject: action.subject, bodyHtml: action.bodyHtml } : d,
      );
    default:
      return drafts;
  }
}

export default function GeneratedEmailsContent() {
  const searchParams = useSearchParams();
  const buildBatchId = searchParams.get('buildBatchId') ?? undefined;
  const leadId = searchParams.get('leadId') ?? undefined;

  const [drafts, setDrafts] = useState<GeneratedEmail[]>([]);
  const [summary, setSummary] = useState({
    totalGenerated: 0,
    validDrafts: 0,
    invalidDrafts: 0,
    approvedDrafts: 0,
    pendingApproval: 0,
    sentDrafts: 0,
    failedDrafts: 0,
  });
  const [previewIndex, setPreviewIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [previewMode, setPreviewMode] = useState<'html' | 'plain'>('html');
  const [editSubject, setEditSubject] = useState('');
  const [editBodyHtml, setEditBodyHtml] = useState('');
  const [isPending, startTransition] = useTransition();

  const [optimisticDrafts, updateOptimistic] = useOptimistic(drafts, applyOptimistic);

  const load = useCallback(async () => {
    const [list, sum] = await Promise.all([
      buildBatchId
        ? generatedEmailsApi.listByBatch(buildBatchId)
        : generatedEmailsApi.list({
            limit: '50',
            ...(leadId ? { leadId } : {}),
          }).then((r) => r.items),
      generatedEmailsApi.summary(buildBatchId),
    ]);
    setDrafts(list);
    setSummary(sum);
    setPreviewIndex((i) => Math.min(i, Math.max(0, list.length - 1)));
  }, [buildBatchId, leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = optimisticDrafts[previewIndex];
  const canEdit = current && (current.status === 'DRAFT' || current.status === 'FAILED');

  const startEdit = () => {
    if (!current) return;
    setEditSubject(current.subject);
    setEditBodyHtml(current.bodyHtml);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setError(null);
  };

  const saveEdit = () => {
    if (!current) return;
    updateOptimistic({
      type: 'update',
      id: current.id,
      subject: editSubject,
      bodyHtml: editBodyHtml,
    });
    startTransition(async () => {
      try {
        setError(null);
        await generatedEmailsApi.update(current.id, {
          subject: editSubject,
          bodyHtml: editBodyHtml,
        });
        setIsEditing(false);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Save failed');
        await load();
      }
    });
  };

  const approve = (id: string) => {
    updateOptimistic({ type: 'approve', id });
    startTransition(async () => {
      try {
        setError(null);
        await generatedEmailsApi.approve(id);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Approve failed');
        await load();
      }
    });
  };

  const approveAllValid = () => {
    if (!buildBatchId) return;
    updateOptimistic({ type: 'approveAllValid' });
    startTransition(async () => {
      try {
        setError(null);
        await generatedEmailsApi.bulkApprove({ buildBatchId, approveAllValidInBatch: true });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Bulk approve failed');
        await load();
      }
    });
  };

  const unapprove = (id: string) => {
    startTransition(async () => {
      try {
        setError(null);
        await generatedEmailsApi.unapprove(id);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unapprove failed');
        await load();
      }
    });
  };

  const deleteDraft = (id: string) => {
    updateOptimistic({ type: 'delete', id });
    startTransition(async () => {
      try {
        setError(null);
        await generatedEmailsApi.delete(id);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Delete failed');
        await load();
      }
    });
  };

  return (
    <>
      <PageHeader
        title="Generated Emails"
        description="Review, edit, and approve drafts before sending."
      />
      <div className="space-y-6 p-8">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">Generated: {summary.totalGenerated}</Badge>
          <Badge variant="success">Valid: {summary.validDrafts}</Badge>
          <Badge variant="warning">Invalid: {summary.invalidDrafts}</Badge>
          <Badge variant="default">Approved: {summary.approvedDrafts}</Badge>
          <Badge variant="outline">Pending: {summary.pendingApproval}</Badge>
          {summary.approvedDrafts > 0 && (
            <Link href={buildBatchId ? `/send?buildBatchId=${buildBatchId}` : '/send'}>
              <Button size="sm" variant="outline">
                <Send className="mr-2 h-4 w-4" />
                Go to Send ({summary.approvedDrafts})
              </Button>
            </Link>
          )}
        </div>

        {buildBatchId && summary.validDrafts > 0 && (
          <Button onClick={approveAllValid} disabled={isPending}>
            <Check className="mr-2 h-4 w-4" />
            Approve All Valid ({summary.validDrafts})
          </Button>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Drafts</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[500px] space-y-2 overflow-y-auto">
              {optimisticDrafts.map((d, i) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setPreviewIndex(i);
                    setIsEditing(false);
                  }}
                  className={`w-full rounded border p-3 text-left hover:bg-muted/50 ${
                    i === previewIndex ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">{d.lead?.companyName ?? '—'}</p>
                      <p className="truncate text-xs text-muted-foreground">{d.subject}</p>
                    </div>
                    <div className="ml-2 flex shrink-0 gap-1">
                      <Badge variant={d.isValid ? 'success' : 'destructive'} className="text-xs">
                        {d.isValid ? '✓' : '✗'}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {d.status}
                      </Badge>
                    </div>
                  </div>
                </button>
              ))}
              {optimisticDrafts.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No drafts.{' '}
                  <Link href="/build" className="text-primary underline">
                    Build emails
                  </Link>{' '}
                  first.
                </p>
              )}
            </CardContent>
          </Card>

          {current && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {current.lead?.companyName} — {current.lead?.receiverName}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={previewIndex === 0}
                      onClick={() => {
                        setPreviewIndex((i) => i - 1);
                        setIsEditing(false);
                      }}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {previewIndex + 1} / {optimisticDrafts.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={previewIndex >= optimisticDrafts.length - 1}
                      onClick={() => {
                        setPreviewIndex((i) => i + 1);
                        setIsEditing(false);
                      }}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isEditing ? (
                  <>
                    <div className="space-y-1 text-sm">
                      <p>
                        <span className="text-muted-foreground">To:</span> {current.recipientEmail}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Subject:</span> {current.subject}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Resume:</span>{' '}
                        {current.resume?.fileName}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Button
                          variant={previewMode === 'html' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setPreviewMode('html')}
                        >
                          HTML
                        </Button>
                        <Button
                          variant={previewMode === 'plain' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setPreviewMode('plain')}
                        >
                          Plain text
                        </Button>
                      </div>
                      {previewMode === 'html' ? (
                        <DraftHtmlPreview
                          html={current.bodyHtml}
                          className="h-80 w-full rounded-md border"
                        />
                      ) : (
                        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-4 text-xs">
                          {current.bodyPlainText ?? '(no plain text)'}
                        </pre>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <Label>Subject</Label>
                      <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
                    </div>
                    <div>
                      <Label>Body</Label>
                      <TiptapEditor content={editBodyHtml} onChange={setEditBodyHtml} />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={saveEdit} disabled={isPending || !editSubject.trim()}>
                        Save changes
                      </Button>
                      <Button variant="outline" onClick={cancelEdit} disabled={isPending}>
                        <X className="mr-2 h-4 w-4" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-sm font-medium">Variables</p>
                  <div className="space-y-1">
                    {Object.entries(current.renderedVariables ?? {}).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="font-mono">{k}</span>
                        <span className="text-muted-foreground">
                          {v.value || '—'}{' '}
                          <span className="opacity-60">({v.source})</span>
                        </span>
                      </div>
                    ))}
                    {current.missingVariables.map((v) => (
                      <div key={v} className="flex justify-between text-xs text-destructive">
                        <span className="font-mono">{v}</span>
                        <span>missing</span>
                      </div>
                    ))}
                  </div>
                </div>

                {!isEditing && (
                  <div className="flex flex-wrap gap-2">
                    {canEdit && (
                      <Button variant="outline" size="sm" onClick={startEdit} disabled={isPending}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                    )}
                    {current.status === 'APPROVED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => unapprove(current.id)}
                        disabled={isPending}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Unapprove
                      </Button>
                    )}
                    {current.status === 'DRAFT' && current.isValid && (
                      <Button onClick={() => approve(current.id)} disabled={isPending}>
                        <Check className="mr-2 h-4 w-4" />
                        Approve
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteDraft(current.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
