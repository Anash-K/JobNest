'use client';

import Link from 'next/link';
import { useCallback, useEffect, useOptimistic, useState, useTransition } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { PIPELINE_STATUS_ORDER, type PipelineStatus } from '@jobhunter/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Input } from '@/components/ui/input';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { LeadDetailSheet } from './LeadDetailSheet';
import {
  campaignsApi,
  pipelineApi,
  type Campaign,
  type PipelineBoard,
  type PipelineCard,
} from '@/lib/api';

type MoveAction = { type: 'move'; cardId: string; from: PipelineStatus; to: PipelineStatus };

function applyMove(board: PipelineBoard, action: MoveAction): PipelineBoard {
  const card = board.columns[action.from]?.find((c) => c.id === action.cardId);
  if (!card) return board;

  const columns = { ...board.columns };
  const counts = { ...board.counts };

  columns[action.from] = columns[action.from]!.filter((c) => c.id !== action.cardId);
  counts[action.from] = Math.max(0, (counts[action.from] ?? 0) - 1);

  const moved = { ...card, pipelineStatus: action.to };
  columns[action.to] = [moved, ...(columns[action.to] ?? [])];
  counts[action.to] = (counts[action.to] ?? 0) + 1;

  return { columns, counts };
}

export function KanbanBoard() {
  const [board, setBoard] = useState<PipelineBoard | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [search, setSearch] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [selectedCard, setSelectedCard] = useState<PipelineCard | null>(null);
  const [activeCard, setActiveCard] = useState<PipelineCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [optimisticBoard, updateOptimistic] = useOptimistic(
    board ?? {
      columns: Object.fromEntries(PIPELINE_STATUS_ORDER.map((s) => [s, []])),
      counts: Object.fromEntries(PIPELINE_STATUS_ORDER.map((s) => [s, 0])),
    },
    applyMove,
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const load = useCallback(async () => {
    const params: Record<string, string> = {};
    if (search.trim()) params.search = search.trim();
    if (campaignId) params.campaignId = campaignId;

    const [data, camps] = await Promise.all([
      pipelineApi.getBoard(params),
      campaignsApi.list(),
    ]);
    setBoard(data);
    setCampaigns(camps);
    setError(null);
  }, [search, campaignId]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  const handleDragStart = (event: DragStartEvent) => {
    const card = event.active.data.current?.card as PipelineCard | undefined;
    if (card) setActiveCard(card);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveCard(null);
    const { active, over } = event;
    if (!over || !board) return;

    const fromStatus = active.data.current?.status as PipelineStatus | undefined;
    const toStatus = over.id as PipelineStatus;
    const cardId = String(active.id);

    if (!fromStatus || fromStatus === toStatus || !PIPELINE_STATUS_ORDER.includes(toStatus)) return;

    updateOptimistic({ type: 'move', cardId, from: fromStatus, to: toStatus });
    startTransition(async () => {
      try {
        await pipelineApi.moveLead(cardId, { pipelineStatus: toStatus });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to move lead');
        await load();
      }
    });
  };

  const displayBoard = optimisticBoard;

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Drag leads across stages from New to Offer."
      />
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap gap-3">
          <Input
            placeholder="Search company, title, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <select
            className="h-10 rounded-md border px-3 text-sm"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
          >
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Link href="/build" className="text-sm text-primary underline self-center">
            Build emails →
          </Link>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!board ? (
          <p className="text-sm text-muted-foreground">Loading pipeline…</p>
        ) : (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex gap-3 overflow-x-auto pb-4">
              {PIPELINE_STATUS_ORDER.map((status) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  cards={displayBoard.columns[status] ?? []}
                  count={displayBoard.counts[status] ?? 0}
                  onCardClick={setSelectedCard}
                />
              ))}
            </div>
            <DragOverlay>
              {activeCard ? (
                <div className="w-[220px] opacity-90">
                  <KanbanCard
                    card={activeCard}
                    status={activeCard.pipelineStatus as PipelineStatus}
                    onClick={() => {}}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {selectedCard && (
        <LeadDetailSheet
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onUpdated={() => void load()}
        />
      )}
    </>
  );
}
