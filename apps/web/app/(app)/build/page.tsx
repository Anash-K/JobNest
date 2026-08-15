'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { VariableMapper } from '@/components/templates/VariableMapper';
import { DraftHtmlPreview } from '@/components/build/DraftHtmlPreview';
import {
  campaignsApi,
  generatedEmailsApi,
  leadsApi,
  resumesApi,
  templatesApi,
  type Campaign,
  type EmailTemplate,
  type JobLead,
  type Resume,
} from '@/lib/api';
import { Hammer, Search } from 'lucide-react';

const STEPS = [
  'Campaign',
  'Leads',
  'Template',
  'Resume',
  'Variables',
  'Review & Build',
] as const;

export default function BuildPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<JobLead[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [sources, setSources] = useState<{ coreFields: string[]; customFields: string[] }>({
    coreFields: [],
    customFields: [],
  });

  const [campaignId, setCampaignId] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [templateId, setTemplateId] = useState('');
  const [resumeId, setResumeId] = useState('');
  const [variableMap, setVariableMap] = useState<Record<string, string>>({});
  const [defaultValues, setDefaultValues] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<Awaited<
    ReturnType<typeof generatedEmailsApi.validate>
  > | null>(null);
  const [previewLeadId, setPreviewLeadId] = useState<string | null>(null);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;

  const load = useCallback(async () => {
    try {
      const [leadRes, tpls, res, camps, src] = await Promise.all([
        leadsApi.list({ limit: '100' }),
        templatesApi.list(),
        resumesApi.list(),
        campaignsApi.list({ limit: '100' }),
        templatesApi.getSources(),
      ]);
      setLeads(leadRes.items);
      setTemplates(tpls);
      setResumes(res);
      setCampaigns(camps);
      setSources(src);
      const defaultResume = res.find((r) => r.isDefault);
      if (defaultResume) setResumeId(defaultResume.id);
      if (tpls[0]) {
        setTemplateId(tpls[0].id);
        setVariableMap(tpls[0].variableMap ?? {});
        setDefaultValues(tpls[0].defaultValues ?? {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load build data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredLeads = useMemo(() => {
    let items = leads;
    if (campaignId) {
      items = items.filter((l) => l.campaignId === campaignId);
    }
    if (leadSearch.trim()) {
      const q = leadSearch.toLowerCase();
      items = items.filter(
        (l) =>
          l.companyName.toLowerCase().includes(q) ||
          (l.receiverEmail?.toLowerCase().includes(q) ?? false) ||
          (l.jobTitle?.toLowerCase().includes(q) ?? false),
      );
    }
    return items;
  }, [leads, campaignId, leadSearch]);

  const toggleLead = (id: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedLeadIds(new Set(filteredLeads.map((l) => l.id)));
  };

  const onTemplateChange = (id: string) => {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) {
      setVariableMap(tpl.variableMap ?? {});
      setDefaultValues(tpl.defaultValues ?? {});
    }
  };

  const saveVariableMapping = async () => {
    if (!templateId) return;
    await templatesApi.updateVariableMap(templateId, variableMap);
    await templatesApi.updateDefaultValues(templateId, defaultValues);
    const updated = await templatesApi.get(templateId);
    setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const runValidation = () => {
    startTransition(async () => {
      try {
        setError(null);
        await saveVariableMapping();
        const result = await generatedEmailsApi.validate({
          leadIds: [...selectedLeadIds],
          templateId,
          resumeId: resumeId || undefined,
          campaignId: campaignId || undefined,
        });
        setValidation(result);
        setPreviewLeadId(result.previews[0]?.leadId ?? null);
        setStep(5);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Validation failed');
      }
    });
  };

  const build = () => {
    startTransition(async () => {
      try {
        setError(null);
        const result = await generatedEmailsApi.build({
          leadIds: [...selectedLeadIds],
          templateId,
          resumeId: resumeId || undefined,
          campaignId: campaignId || undefined,
        });
        router.push(`/generated-emails?buildBatchId=${result.buildBatchId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Build failed');
      }
    });
  };

  const previewItem = validation?.previews.find((p) => p.leadId === previewLeadId) ?? null;

  if (loading) {
    return (
      <>
        <PageHeader title="Build Emails" description="Generate personalized drafts for review." />
        <div className="mx-auto max-w-3xl space-y-4 p-8">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Build Emails"
        description="Campaign → leads → template → resume → variables → validate → build drafts."
      />
      <div className="mx-auto max-w-3xl space-y-6 p-8">
        <div className="flex flex-wrap gap-2 text-xs">
          {STEPS.map((label, i) => (
            <Badge key={label} variant={step === i ? 'default' : i < step ? 'success' : 'secondary'}>
              {i + 1}. {label}
            </Badge>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Campaign (optional)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Filter leads by campaign. Leave empty to include leads from any campaign.
              </p>
              <select
                className="w-full h-10 rounded-md border px-3 text-sm"
                value={campaignId}
                onChange={(e) => {
                  setCampaignId(e.target.value);
                  setSelectedLeadIds(new Set());
                }}
              >
                <option value="">All campaigns</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Button onClick={() => setStep(1)}>Next</Button>
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Select Leads ({selectedLeadIds.size})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    className="h-10 w-full rounded-md border pl-9 pr-3 text-sm"
                    placeholder="Search company, email, title…"
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={selectAllVisible}>
                  Select all
                </Button>
              </div>
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {filteredLeads.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No leads match.{' '}
                    <Link href="/leads" className="text-primary underline">
                      Add leads
                    </Link>{' '}
                    first.
                  </p>
                )}
                {filteredLeads.map((lead) => (
                  <label
                    key={lead.id}
                    className="flex cursor-pointer items-center gap-3 rounded border p-3 hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedLeadIds.has(lead.id)}
                      onChange={() => toggleLead(lead.id)}
                    />
                    <div>
                      <p className="font-medium">{lead.companyName}</p>
                      <p className="text-xs text-muted-foreground">
                        {lead.jobTitle} · {lead.receiverEmail}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button disabled={selectedLeadIds.size === 0} onClick={() => setStep(2)}>
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Select Template</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Email template</Label>
                <select
                  className="mt-1 w-full h-10 rounded-md border px-3 text-sm"
                  value={templateId}
                  onChange={(e) => onTemplateChange(e.target.value)}
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              {selectedTemplate && selectedTemplate.detectedVars.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Variables: {selectedTemplate.detectedVars.map((v) => `{{${v}}}`).join(', ')}
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button disabled={!templateId} onClick={() => setStep(3)}>
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Select Resume</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <select
                className="w-full h-10 rounded-md border px-3 text-sm"
                value={resumeId}
                onChange={(e) => setResumeId(e.target.value)}
              >
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} (v{r.version}){r.isDefault ? ' — Default' : ''}
                  </option>
                ))}
              </select>
              {resumes.length === 0 && (
                <p className="text-sm text-amber-600">
                  No resumes uploaded.{' '}
                  <Link href="/resumes" className="underline">
                    Upload a resume
                  </Link>
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button disabled={!resumeId} onClick={() => setStep(4)}>
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 4 && selectedTemplate && (
          <Card>
            <CardHeader>
              <CardTitle>Variable Mapping</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <VariableMapper
                variables={selectedTemplate.detectedVars}
                variableMap={variableMap}
                defaultValues={defaultValues}
                coreFields={sources.coreFields}
                customFields={sources.customFields}
                onMapChange={setVariableMap}
                onDefaultChange={setDefaultValues}
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(3)}>
                  Back
                </Button>
                <Button onClick={runValidation} disabled={isPending}>
                  {isPending ? 'Validating…' : 'Validate & Review'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 5 && validation && (
          <Card>
            <CardHeader>
              <CardTitle>Review & Build</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Total: {validation.total}</Badge>
                <Badge variant="success">Valid: {validation.validCount}</Badge>
                <Badge variant={validation.invalidCount > 0 ? 'destructive' : 'secondary'}>
                  Invalid: {validation.invalidCount}
                </Badge>
              </div>

              {validation.invalidCount > 0 && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  {validation.invalidCount} draft(s) have missing variables. They will be created
                  as invalid drafts and cannot be approved until fixed.
                </p>
              )}

              <div>
                <Label>Preview lead</Label>
                <select
                  className="mt-1 w-full h-10 rounded-md border px-3 text-sm"
                  value={previewLeadId ?? ''}
                  onChange={(e) => setPreviewLeadId(e.target.value)}
                >
                  {validation.previews.map((p) => (
                    <option key={p.leadId} value={p.leadId}>
                      {p.companyName} {p.isValid ? '✓' : '✗'}
                    </option>
                  ))}
                </select>
              </div>

              {previewItem && (
                <div className="space-y-3 rounded-md border p-4">
                  <p className="text-sm">
                    <span className="text-muted-foreground">Subject:</span> {previewItem.subject}
                  </p>
                  <DraftHtmlPreview html={previewItem.bodyHtml} className="h-64 w-full rounded border" />
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Plain text</summary>
                    <pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2">
                      {previewItem.bodyPlainText}
                    </pre>
                  </details>
                  {!previewItem.isValid && (
                    <p className="text-xs text-destructive">
                      Missing: {previewItem.missingVariables.join(', ')}
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(4)}>
                  Back
                </Button>
                <Button onClick={build} disabled={isPending || validation.total === 0}>
                  <Hammer className="mr-2 h-4 w-4" />
                  {isPending ? 'Building…' : `Build ${validation.total} Draft(s)`}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
