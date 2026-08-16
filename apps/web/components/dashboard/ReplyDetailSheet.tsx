'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DraftHtmlPreview } from '@/components/build/DraftHtmlPreview';
import { useMarkReplyRead, useReply } from '@/hooks/queries/use-replies';
import { formatRelativeTime } from '@/lib/utils';
import { PIPELINE_STATUS_LABELS } from '@jobhunter/shared';

interface ReplyDetailSheetProps {
  replyId: string;
  onClose: () => void;
}

export function ReplyDetailSheet({ replyId, onClose }: ReplyDetailSheetProps) {
  const { data: reply, isLoading } = useReply(replyId);
  const markRead = useMarkReplyRead();

  useEffect(() => {
    if (reply && !reply.isRead) {
      markRead.mutate(replyId);
    }
    // Only re-run when a different reply is opened — not on every markRead re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyId, reply?.isRead]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 flex h-full w-full max-w-lg flex-col border-l bg-background shadow-xl">
        <div className="flex items-start justify-between border-b p-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{reply?.subject ?? 'Reply'}</h2>
            {reply?.jobLead && (
              <p className="text-sm text-muted-foreground">
                {reply.jobLead.companyName}
                {reply.jobLead.jobTitle ? ` · ${reply.jobLead.jobTitle}` : ''}
              </p>
            )}
            {reply?.application && (
              <Badge variant="outline" className="mt-2">
                {PIPELINE_STATUS_LABELS[reply.application.status as keyof typeof PIPELINE_STATUS_LABELS] ??
                  reply.application.status}
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {isLoading || !reply ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              <div className="grid gap-1 text-sm">
                <p>
                  <span className="text-muted-foreground">From:</span>{' '}
                  {reply.senderName ? `${reply.senderName} <${reply.senderEmail}>` : reply.senderEmail}
                </p>
                {reply.recipientEmail && (
                  <p>
                    <span className="text-muted-foreground">To:</span> {reply.recipientEmail}
                  </p>
                )}
                <p>
                  <span className="text-muted-foreground">Received:</span>{' '}
                  {formatRelativeTime(reply.receivedAt)}
                </p>
                {reply.emailLog?.subject && (
                  <p>
                    <span className="text-muted-foreground">In reply to:</span> {reply.emailLog.subject}
                  </p>
                )}
              </div>

              {reply.bodyHtml ? (
                <DraftHtmlPreview html={reply.bodyHtml} className="h-96 w-full rounded-md border bg-white" />
              ) : reply.bodyPlainText ? (
                <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
                  {reply.bodyPlainText}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">No message content.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
