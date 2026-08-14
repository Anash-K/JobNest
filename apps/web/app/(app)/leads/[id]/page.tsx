'use client';

import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { LeadForm, type LeadFormPayload } from '@/components/leads/LeadForm';
import { useLead, useUpdateLead } from '@/hooks/queries/use-leads';

export default function LeadEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: lead, isLoading } = useLead(id);
  const updateLead = useUpdateLead();

  const handleSave = (payload: LeadFormPayload) => {
    updateLead.mutate(
      { id, data: payload },
      { onSuccess: () => router.push('/leads') },
    );
  };

  if (isLoading || !lead) return <div className="p-8">Loading…</div>;

  return (
    <>
      <PageHeader title={`Edit: ${lead.companyName}`} description="Update lead details and custom fields." />
      <div className="mx-auto max-w-2xl space-y-4 p-8">
        <LeadForm
          mode="edit"
          initialLead={lead}
          onSubmit={handleSave}
          submitting={updateLead.isPending}
          submitLabel="Save Changes"
        />
        <Button variant="outline" onClick={() => router.push('/leads')}>
          Back
        </Button>
      </div>
    </>
  );
}
