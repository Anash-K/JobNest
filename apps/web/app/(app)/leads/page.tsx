'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LeadImportWizard } from '@/components/leads/LeadImportWizard';
import { LeadForm, type LeadFormPayload } from '@/components/leads/LeadForm';
import { useCreateLead, useLeads } from '@/hooks/queries/use-leads';

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const { data: leadsData, isLoading } = useLeads({ limit: '50' });
  const createLead = useCreateLead();
  const [formResetKey, setFormResetKey] = useState(0);

  const leads = leadsData?.items ?? [];

  const handleCreateLead = (payload: LeadFormPayload) => {
    createLead.mutate(payload, {
      onSuccess: () => setFormResetKey((k) => k + 1),
    });
  };

  return (
    <>
      <PageHeader title="Leads" description="Manage job leads and import from Excel or CSV." />
      <div className="space-y-6 p-8">
        <LeadImportWizard
          onComplete={() => {
            void queryClient.invalidateQueries({ queryKey: ['leads'] });
          }}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <LeadForm
            key={formResetKey}
            mode="create"
            onSubmit={handleCreateLead}
            submitting={createLead.isPending}
          />

          <Card>
            <CardHeader>
              <CardTitle>Leads ({leads.length})</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[600px] space-y-2 overflow-y-auto">
              {isLoading && <p className="text-sm text-muted-foreground">Loading leads…</p>}
              {leads.map((lead) => (
                <Link key={lead.id} href={`/leads/${lead.id}`} className="block">
                  <div className="rounded border p-3 transition-colors hover:border-primary hover:bg-accent/50">
                    <p className="font-medium">{lead.companyName}</p>
                    <p className="text-xs text-muted-foreground">
                      {lead.jobTitle} · {lead.receiverEmail}
                    </p>
                    {lead.campaign && (
                      <p className="mt-1 text-xs text-primary">{lead.campaign.name}</p>
                    )}
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
