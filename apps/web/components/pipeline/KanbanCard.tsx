'use client';

import Link from 'next/link';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import type { PipelineCard } from '@/lib/api';
import type { PipelineStatus } from '@jobhunter/shared';

const COLUMN_ACCENT: Record<PipelineStatus, string> = {
  NEW: 'border-t-slate-400',
  READY_TO_APPLY: 'border-t-blue-500',
  APPLIED: 'border-t-amber-500',
  REPLIED: 'border-t-purple-500',
  INTERVIEW: 'border-t-orange-500',
  OFFER: 'border-t-emerald-500',
  REJECTED: 'border-t-red-500',
  NO_RESPONSE: 'border-t-slate-500',
};

interface KanbanCardProps {
  card: PipelineCard;
  status: PipelineStatus;
  onClick: () => void;
}

export function KanbanCard({ card, status, onClick }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { card, status },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (!isDragging) onClick();
        e.stopPropagation();
      }}
      className={`cursor-grab rounded-lg border bg-card p-3 shadow-sm active:cursor-grabbing hover:border-primary/50 ${COLUMN_ACCENT[status]} border-t-4`}
    >
      <p className="font-medium text-sm leading-tight">{card.companyName}</p>
      {card.jobTitle && (
        <p className="mt-1 text-xs text-muted-foreground truncate">{card.jobTitle}</p>
      )}
      {card.receiverName && (
        <p className="text-xs text-muted-foreground truncate">{card.receiverName}</p>
      )}
      {card.campaign && (
        <Badge variant="secondary" className="mt-2 text-[10px]">
          {card.campaign.name}
        </Badge>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {card.draftCount > 0 && (
          <Link
            href={`/generated-emails?leadId=${card.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex"
          >
            <Badge variant="outline" className="text-[10px] hover:bg-muted">
              {card.draftCount} draft{card.draftCount !== 1 ? 's' : ''}
            </Badge>
          </Link>
        )}
        {card.approvedDraftCount > 0 && (
          <Link
            href={`/send?leadId=${card.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex"
          >
            <Badge variant="success" className="text-[10px]">
              {card.approvedDraftCount} approved
            </Badge>
          </Link>
        )}
      </div>
      {card.notes && (
        <p className="mt-2 text-[10px] text-muted-foreground line-clamp-2">{card.notes}</p>
      )}
    </div>
  );
}

export { COLUMN_ACCENT };
