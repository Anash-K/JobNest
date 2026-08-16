'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useReplies, useUnreadReplyCount } from '@/hooks/queries/use-replies';
import { formatRelativeTime } from '@/lib/utils';
import { ReplyDetailSheet } from './ReplyDetailSheet';

const RECENT_REPLIES_LIMIT = '5';

export function RepliesSection() {
  const { data: unreadCount } = useUnreadReplyCount();
  const { data: recent, isLoading } = useReplies({ limit: RECENT_REPLIES_LIMIT });
  const [selectedReplyId, setSelectedReplyId] = useState<string | null>(null);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Replies</CardTitle>
          <Badge variant={unreadCount?.count ? 'success' : 'secondary'}>
            {unreadCount?.count ?? 0} unread
          </Badge>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : !recent || recent.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No replies yet.</p>
          ) : (
            <div className="space-y-2">
              {recent.items.map((reply) => (
                <button
                  key={reply.id}
                  type="button"
                  onClick={() => setSelectedReplyId(reply.id)}
                  className="flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {!reply.isRead && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                      )}
                      <p className="truncate text-sm font-medium">
                        {reply.jobLead?.companyName ?? reply.senderEmail}
                      </p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {reply.senderName ?? reply.senderEmail}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {reply.bodyPlainText?.trim() || reply.subject || 'No preview available'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(reply.receivedAt)}
                    </span>
                    <span className="text-xs text-primary">View</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedReplyId && (
        <ReplyDetailSheet replyId={selectedReplyId} onClose={() => setSelectedReplyId(null)} />
      )}
    </>
  );
}
