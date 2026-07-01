'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { applicationsApi, campaignsApi, type Application, type Campaign } from '@/lib/api';
import { PIPELINE_STATUS_LABELS, type PipelineStatus } from '@jobhunter/shared';

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    const params: Record<string, string> = { limit: '50' };
    if (search.trim()) params.search = search.trim();
    if (statusFilter) params.status = statusFilter;
    if (campaignId) params.campaignId = campaignId;

    const [result, camps] = await Promise.all([
      applicationsApi.list(params),
      campaignsApi.list(),
    ]);
    setApplications(result.items);
    setTotal(result.meta.total);
    setCampaigns(camps);
  }, [search, statusFilter, campaignId]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <>
      <PageHeader
        title="Applications"
        description="Track sent applications and their pipeline status."
      />
      <div className="space-y-4 p-8">
        <div className="flex flex-wrap gap-3">
          <Input
            placeholder="Search company, position, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <select
            className="h-10 rounded-md border px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {Object.entries(PIPELINE_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
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
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Applications ({total})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Company</th>
                  <th className="pb-2 pr-4 font-medium">Position</th>
                  <th className="pb-2 pr-4 font-medium">Receiver</th>
                  <th className="pb-2 pr-4 font-medium">Campaign</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium">Applied</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr key={app.id} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-medium">
                      {app.jobLead ? (
                        <Link href="/pipeline" className="hover:underline">
                          {app.companyName}
                        </Link>
                      ) : (
                        app.companyName
                      )}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{app.position ?? '—'}</td>
                    <td className="py-3 pr-4">
                      <div>{app.receiverName ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{app.receiverEmail}</div>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {app.campaign?.name ?? '—'}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant="outline">
                        {PIPELINE_STATUS_LABELS[app.status as PipelineStatus] ?? app.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {new Date(app.appliedDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {applications.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No applications yet. Send approved drafts to create application records.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
