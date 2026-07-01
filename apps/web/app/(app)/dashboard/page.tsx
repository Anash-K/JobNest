'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  analyticsApi,
  campaignsApi,
  type AnalyticsSummary,
  type Application,
  type Campaign,
  type DraftFunnel,
  type EmailLog,
  type RecentActivity,
} from '@/lib/api';
import { PIPELINE_STATUS_LABELS, type PipelineStatus } from '@jobhunter/shared';
import { Search } from 'lucide-react';

const PIPELINE_COLORS: Record<string, string> = {
  NEW: '#94a3b8',
  READY_TO_APPLY: '#3b82f6',
  APPLIED: '#f59e0b',
  REPLIED: '#a855f7',
  INTERVIEW: '#f97316',
  OFFER: '#10b981',
  REJECTED: '#ef4444',
};

const FUNNEL_COLORS = ['#6366f1', '#8b5cf6', '#22c55e', '#ef4444'];

const ACTIVITY_LABELS: Record<RecentActivity['type'], string> = {
  application: 'Application',
  email_sent: 'Email sent',
  email_failed: 'Email failed',
  lead_created: 'Lead added',
};

function KpiCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant?: 'default' | 'success' | 'warning' | 'destructive';
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {variant && variant !== 'default' && (
          <Badge variant={variant} className="mt-2 text-[10px]">
            {label}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-8">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [funnel, setFunnel] = useState<DraftFunnel | null>(null);
  const [byMonth, setByMonth] = useState<Array<{ month: string; count: number }>>([]);
  const [byCampaign, setByCampaign] = useState<Array<{ campaignName: string; count: number }>>([]);
  const [pipeline, setPipeline] = useState<Array<{ status: string; count: number; name: string }>>(
    [],
  );
  const [recentApps, setRecentApps] = useState<Application[]>([]);
  const [failedEmails, setFailedEmails] = useState<EmailLog[]>([]);
  const [activity, setActivity] = useState<RecentActivity[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const cid = campaignId || undefined;
      const [camps, sum, fun, month, camp, pipe, recent, failed, act] = await Promise.all([
        campaignsApi.list({ limit: '100' }),
        analyticsApi.summary(cid),
        analyticsApi.draftFunnel(cid),
        analyticsApi.applicationsByMonth(cid),
        analyticsApi.applicationsByCampaign(),
        analyticsApi.pipelineDistribution(cid),
        analyticsApi.recentApplications(cid),
        analyticsApi.failedEmails(cid),
        analyticsApi.recentActivity({ campaignId: cid, limit: 15, search: search.trim() || undefined }),
      ]);
      setCampaigns(camps);
      setSummary(sum);
      setFunnel(fun);
      setByMonth(month);
      setByCampaign(camp.map((c) => ({ campaignName: c.campaignName, count: c.count })));
      setPipeline(
        pipe.map((p) => ({
          ...p,
          name: PIPELINE_STATUS_LABELS[p.status as PipelineStatus] ?? p.status,
        })),
      );
      setRecentApps(recent);
      setFailedEmails(failed);
      setActivity(act);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [campaignId, search]);

  useEffect(() => {
    const t = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const funnelData = funnel
    ? [
        { name: 'Draft', value: funnel.draft },
        { name: 'Approved', value: Math.max(0, funnel.approved - funnel.sent) },
        { name: 'Sent', value: funnel.sent },
        { name: 'Failed', value: funnel.failed },
      ].filter((d) => d.value > 0)
    : [];

  if (loading && !summary) {
    return (
      <>
        <PageHeader title="Dashboard" description="Outreach KPIs and application tracking." />
        <DashboardSkeleton />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Tenant-scoped KPIs, campaign performance, and recent activity."
      />
      <div className="space-y-6 p-8">
        <div className="flex flex-wrap items-center gap-3">
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
          <div className="relative min-w-[200px] flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search recent activity…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Link href="/pipeline" className="text-sm text-primary underline">
            View pipeline →
          </Link>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {summary && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard label="Total Leads" value={summary.totalLeads} />
            <KpiCard label="Campaigns" value={summary.totalCampaigns} />
            <KpiCard label="Templates" value={summary.totalTemplates} />
            <KpiCard label="Resumes" value={summary.totalResumes} />
            <KpiCard label="Drafts" value={summary.totalDrafts} />
            <KpiCard label="Emails Sent" value={summary.applicationsSent} variant="success" />
            <KpiCard label="Failed Emails" value={summary.failedEmails} variant="destructive" />
            <KpiCard label="Applications" value={summary.totalApplications} />
            <KpiCard label="Interviews" value={summary.interviews} variant="warning" />
            <KpiCard label="Offers" value={summary.offers} variant="success" />
          </div>
        )}

        {summary && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard label="Ready to Apply" value={summary.readyToApply} />
            <KpiCard label="Replies" value={summary.replies} />
            <KpiCard label="Rejections" value={summary.rejections} />
            <KpiCard label="Pending Approval" value={summary.pendingApproval} variant="warning" />
            <KpiCard label="Approved Drafts" value={summary.approvedDrafts} />
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campaign Performance (Draft Funnel)</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              {funnelData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No draft data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {funnelData.map((_, i) => (
                        <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              {funnel && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>Gen→Approved: {(funnel.conversionRates.generatedToApproved * 100).toFixed(0)}%</span>
                  <span>Approved→Sent: {(funnel.conversionRates.approvedToSent * 100).toFixed(0)}%</span>
                  <span>Success: {(funnel.conversionRates.sentSuccessRate * 100).toFixed(0)}%</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pipeline Distribution</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              {pipeline.every((p) => p.count === 0) ? (
                <p className="text-sm text-muted-foreground">No leads yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pipeline.filter((p) => p.count > 0)}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(props) => {
                        const name = String(props.name ?? '');
                        const count = Number(props.value ?? 0);
                        return `${name}: ${count}`;
                      }}
                    >
                      {pipeline
                        .filter((p) => p.count > 0)
                        .map((p) => (
                          <Cell key={p.status} fill={PIPELINE_COLORS[p.status] ?? '#64748b'} />
                        ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Application Trends</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              {byMonth.length === 0 ? (
                <p className="text-sm text-muted-foreground">No applications yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byMonth}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Applications by Campaign</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              {byCampaign.every((c) => c.count === 0) ? (
                <p className="text-sm text-muted-foreground">No campaign data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byCampaign} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="campaignName" width={100} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activity.length === 0 && (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            )}
            {activity.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 rounded border p-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {ACTIVITY_LABELS[item.type]}
                    </Badge>
                    <p className="font-medium truncate">{item.title}</p>
                  </div>
                  {item.subtitle && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">{item.subtitle}</p>
                  )}
                  {item.campaignName && (
                    <p className="text-xs text-muted-foreground">{item.campaignName}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <Badge variant="secondary" className="text-[10px]">
                    {item.status}
                  </Badge>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(item.occurredAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Recent Applications</CardTitle>
              <Link href="/applications" className="text-xs text-primary underline">
                View all
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentApps.length === 0 && (
                <p className="text-sm text-muted-foreground">No applications yet.</p>
              )}
              {recentApps.map((app) => (
                <div
                  key={app.id}
                  className="flex items-center justify-between rounded border p-2 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {app.companyName || app.jobLead?.companyName || 'Unknown company'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {app.position ?? app.notes}
                    </p>
                  </div>
                  <Badge variant="outline">{app.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Failed Emails</CardTitle>
              <Link href="/email-logs" className="text-xs text-primary underline">
                View all
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {failedEmails.length === 0 && (
                <p className="text-sm text-muted-foreground">No failed emails.</p>
              )}
              {failedEmails.map((log) => (
                <div key={log.id} className="rounded border p-2 text-sm">
                  <p className="truncate font-medium">{log.subject}</p>
                  <p className="text-xs text-muted-foreground">{log.recipientEmail}</p>
                  {log.failureMessage && (
                    <p className="mt-1 line-clamp-1 text-xs text-destructive">
                      {log.failureMessage}
                    </p>
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
