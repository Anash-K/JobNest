'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LeadImportWizard } from '@/components/leads/LeadImportWizard';
import { useCampaigns, useCreateCampaign } from '@/hooks/queries/use-campaigns';
import { useCreateLead, useLeads } from '@/hooks/queries/use-leads';
import { Plus } from 'lucide-react';

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const { data: leadsData, isLoading } = useLeads({ limit: '50' });
  const { data: campaigns } = useCampaigns();
  const createLead = useCreateLead();
  const createCampaign = useCreateCampaign();
  const [form, setForm] = useState({
    companyName: '',
    receiverName: '',
    receiverEmail: '',
    jobTitle: '',
    location: '',
    salary: '',
    campaignId: '',
  });

  const leads = leadsData?.items ?? [];

  const handleCreateLead = () => {
    if (!form.companyName.trim()) return;
    createLead.mutate(
      {
        companyName: form.companyName,
        receiverName: form.receiverName || undefined,
        receiverEmail: form.receiverEmail || undefined,
        jobTitle: form.jobTitle || undefined,
        location: form.location || undefined,
        salary: form.salary || undefined,
        campaignId: form.campaignId || undefined,
      },
      {
        onSuccess: () => {
          setForm({
            companyName: '',
            receiverName: '',
            receiverEmail: '',
            jobTitle: '',
            location: '',
            salary: '',
            campaignId: '',
          });
        },
      },
    );
  };

  const handleCreateCampaign = async () => {
    const name = window.prompt('Campaign name:');
    if (!name) return;
    createCampaign.mutate({ name });
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Add Lead</CardTitle>
              <Button variant="outline" size="sm" onClick={() => void handleCreateCampaign()}>
                + Campaign
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Company *</Label>
                <Input
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Receiver Name</Label>
                  <Input
                    value={form.receiverName}
                    onChange={(e) => setForm({ ...form, receiverName: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    value={form.receiverEmail}
                    onChange={(e) => setForm({ ...form, receiverEmail: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Job Title</Label>
                  <Input
                    value={form.jobTitle}
                    onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Salary</Label>
                <Input
                  value={form.salary}
                  onChange={(e) => setForm({ ...form, salary: e.target.value })}
                />
              </div>
              <div>
                <Label>Campaign</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
                  value={form.campaignId}
                  onChange={(e) => setForm({ ...form, campaignId: e.target.value })}
                >
                  <option value="">— none —</option>
                  {campaigns?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                onClick={handleCreateLead}
                disabled={createLead.isPending || !form.companyName}
              >
                <Plus className="mr-2 h-4 w-4" /> Add Lead
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Leads ({leads.length})</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[500px] space-y-2 overflow-y-auto">
              {isLoading && <p className="text-sm text-muted-foreground">Loading leads…</p>}
              {leads.map((lead) => (
                <div key={lead.id} className="rounded border p-3">
                  <p className="font-medium">{lead.companyName}</p>
                  <p className="text-xs text-muted-foreground">
                    {lead.jobTitle} · {lead.receiverEmail}
                  </p>
                  {lead.campaign && (
                    <p className="mt-1 text-xs text-primary">{lead.campaign.name}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
