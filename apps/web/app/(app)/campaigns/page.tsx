'use client';

import { useState, useTransition } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCampaigns, useCreateCampaign } from '@/hooks/queries/use-campaigns';
import { Plus } from 'lucide-react';

export default function CampaignsPage() {
  const { data: campaigns, isLoading, error } = useCampaigns();
  const createCampaign = useCreateCampaign();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleCreate = () => {
    if (!name.trim()) return;
    startTransition(() => {
      createCampaign.mutate(
        { name: name.trim(), description: description.trim() || undefined },
        {
          onSuccess: () => {
            setName('');
            setDescription('');
          },
        },
      );
    });
  };

  return (
    <>
      <PageHeader title="Campaigns" description="Group leads and email builds by outreach campaign." />
      <div className="grid gap-6 p-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>New Campaign</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Q1 Frontend Outreach"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes about this campaign"
              />
            </div>
            <Button onClick={handleCreate} disabled={isPending || createCampaign.isPending || !name.trim()}>
              <Plus className="mr-2 h-4 w-4" /> Create Campaign
            </Button>
            {createCampaign.error && (
              <p className="text-sm text-destructive">{createCampaign.error.message}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Campaigns ({campaigns?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {error && <p className="text-sm text-destructive">{error.message}</p>}
            {campaigns?.map((c) => (
              <div key={c.id} className="rounded border p-3">
                <p className="font-medium">{c.name}</p>
                {c.description && (
                  <p className="text-xs text-muted-foreground">{c.description}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {c._count?.leads ?? 0} leads · {c._count?.generatedEmails ?? 0} drafts
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
