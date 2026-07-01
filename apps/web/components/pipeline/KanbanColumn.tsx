'use client';

import { useDroppable } from '@dnd-kit/core';
import { PIPELINE_STATUS_LABELS, type PipelineStatus } from '@jobhunter/shared';
import { KanbanCard, COLUMN_ACCENT } from './KanbanCard';
import type { PipelineCard } from '@/lib/api';

interface KanbanColumnProps {
  status: PipelineStatus;
  cards: PipelineCard[];
  count: number;
  onCardClick: (card: PipelineCard) => void;
}

export function KanbanColumn({ status, cards, count, onCardClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-[240px] flex-1 flex-col rounded-lg border bg-muted/30 ${COLUMN_ACCENT[status]} border-t-4 ${
        isOver ? 'ring-2 ring-primary/40' : ''
      }`}
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-sm font-semibold">{PIPELINE_STATUS_LABELS[status]}</h3>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium">{count}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2 min-h-[120px] max-h-[calc(100vh-220px)]">
        {cards.map((card) => (
          <KanbanCard key={card.id} card={card} status={status} onClick={() => onCardClick(card)} />
        ))}
        {cards.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">Drop leads here</p>
        )}
      </div>
    </div>
  );
}
