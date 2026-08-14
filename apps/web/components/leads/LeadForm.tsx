'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { normalizeFieldName, LEAD_CORE_FIELDS, LEAD_CORE_FIELD_LABELS } from '@jobhunter/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useCampaigns, useCreateCampaign } from '@/hooks/queries/use-campaigns';
import { templatesApi, type EmailTemplate, type JobLead } from '@/lib/api';
import { matchLeadField } from '@/lib/variable-field-match';

/** Always-visible core fields — shown regardless of template selection. */
const PRIMARY_CORE_FIELDS = ['companyName', 'receiverName', 'receiverEmail', 'jobTitle', 'location', 'salary'] as const;
const MULTILINE_CORE_FIELDS = new Set(['jobDescription', 'notes']);

type CoreFieldState = Record<(typeof LEAD_CORE_FIELDS)[number] | 'campaignId', string>;

function emptyCoreState(): CoreFieldState {
  return {
    companyName: '',
    receiverName: '',
    receiverEmail: '',
    jobTitle: '',
    location: '',
    salary: '',
    linkedinUrl: '',
    jobUrl: '',
    jobDescription: '',
    notes: '',
    campaignId: '',
  };
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function stringifyCustomFields(fields?: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (value !== null && value !== undefined) out[key] = String(value);
  }
  return out;
}

export interface LeadFormPayload {
  companyName: string;
  receiverName?: string;
  receiverEmail?: string;
  jobTitle?: string;
  location?: string;
  salary?: string;
  linkedinUrl?: string;
  jobUrl?: string;
  jobDescription?: string;
  notes?: string;
  campaignId?: string;
  customFields: Record<string, unknown>;
  customFieldLabels: Record<string, string>;
}

interface LeadFormProps {
  mode: 'create' | 'edit';
  initialLead?: JobLead;
  onSubmit: (payload: LeadFormPayload) => void;
  submitting?: boolean;
  submitLabel?: string;
}

export function LeadForm({ mode, initialLead, onSubmit, submitting, submitLabel }: LeadFormProps) {
  const { data: campaigns } = useCampaigns();
  const createCampaign = useCreateCampaign();

  const [core, setCore] = useState<CoreFieldState>(() => ({
    ...emptyCoreState(),
    companyName: initialLead?.companyName ?? '',
    receiverName: initialLead?.receiverName ?? '',
    receiverEmail: initialLead?.receiverEmail ?? '',
    jobTitle: initialLead?.jobTitle ?? '',
    location: initialLead?.location ?? '',
    salary: initialLead?.salary ?? '',
    linkedinUrl: initialLead?.linkedinUrl ?? '',
    jobUrl: initialLead?.jobUrl ?? '',
    jobDescription: initialLead?.jobDescription ?? '',
    notes: initialLead?.notes ?? '',
    campaignId: initialLead?.campaignId ?? '',
  }));

  const [extraCoreVisible, setExtraCoreVisible] = useState<Set<string>>(() => {
    const s = new Set<string>();
    const optionalCoreFields = ['linkedinUrl', 'jobUrl', 'jobDescription', 'notes'] as const;
    for (const f of optionalCoreFields) {
      if (initialLead?.[f]) s.add(f);
    }
    return s;
  });

  const [customFields, setCustomFields] = useState<Record<string, string>>(() =>
    stringifyCustomFields(initialLead?.customFields),
  );
  const [customFieldLabels, setCustomFieldLabels] = useState<Record<string, string>>(
    () => initialLead?.customFieldLabels ?? {},
  );
  const [deletedKeys, setDeletedKeys] = useState<Set<string>>(new Set());

  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');
  const [newFieldError, setNewFieldError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [sources, setSources] = useState<{ coreFields: string[]; customFields: string[] }>({
    coreFields: [...LEAD_CORE_FIELDS],
    customFields: [],
  });
  const [templateId, setTemplateId] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);

  useEffect(() => {
    void templatesApi.list().then(setTemplates);
    void templatesApi.getSources().then(setSources);
  }, []);

  const onTemplateChange = async (id: string) => {
    setTemplateId(id);
    if (!id) {
      setSelectedTemplate(null);
      return;
    }
    const template = await templatesApi.get(id);
    setSelectedTemplate(template);

    setExtraCoreVisible((prev) => {
      const next = new Set(prev);
      for (const varName of template.detectedVars) {
        const match = matchLeadField(varName, sources.coreFields, sources.customFields);
        if (match && !match.startsWith('customFields.') && !PRIMARY_CORE_FIELDS.includes(match as never)) {
          next.add(match);
        }
      }
      return next;
    });

    setCustomFields((prev) => {
      const next = { ...prev };
      for (const varName of template.detectedVars) {
        const match = matchLeadField(varName, sources.coreFields, sources.customFields);
        const isCoreMatch = match !== null && !match.startsWith('customFields.');
        if (isCoreMatch) continue;
        if (!(varName in next)) next[varName] = '';
      }
      return next;
    });
    setDeletedKeys((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      for (const varName of template.detectedVars) next.delete(varName);
      return next;
    });
  };

  const visibleCoreFields = useMemo(
    () => [...PRIMARY_CORE_FIELDS, ...LEAD_CORE_FIELDS.filter((f) => extraCoreVisible.has(f))],
    [extraCoreVisible],
  );

  const templateFieldNames = useMemo(() => {
    if (!selectedTemplate) return [];
    return selectedTemplate.detectedVars.filter((varName) => {
      const match = matchLeadField(varName, sources.coreFields, sources.customFields);
      return !(match !== null && !match.startsWith('customFields.'));
    });
  }, [selectedTemplate, sources]);

  const orphanCustomFieldKeys = useMemo(
    () => Object.keys(customFields).filter((key) => !templateFieldNames.includes(key)),
    [customFields, templateFieldNames],
  );

  const allActiveKeys = useMemo(
    () => new Set([...LEAD_CORE_FIELDS, ...Object.keys(customFields)]),
    [customFields],
  );

  const handleAddCustomField = () => {
    setNewFieldError(null);
    const key = normalizeFieldName(newFieldName);
    if (!key) {
      setNewFieldError('Enter a field name.');
      return;
    }
    if (allActiveKeys.has(key)) {
      setNewFieldError(`"${key}" already exists.`);
      return;
    }
    setCustomFields((prev) => ({ ...prev, [key]: newFieldValue }));
    setCustomFieldLabels((prev) => ({ ...prev, [key]: newFieldName.trim() }));
    setDeletedKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setNewFieldName('');
    setNewFieldValue('');
  };

  const handleDeleteCustomField = (key: string) => {
    setCustomFields((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setCustomFieldLabels((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDeletedKeys((prev) => new Set(prev).add(key));
  };

  const handleCreateCampaign = async () => {
    const name = window.prompt('Campaign name:');
    if (!name) return;
    createCampaign.mutate({ name });
  };

  const handleSubmit = () => {
    if (!core.companyName.trim()) return;

    const cf: Record<string, unknown> = { ...customFields };
    if (mode === 'edit') {
      for (const key of deletedKeys) cf[key] = null;
    }

    onSubmit({
      companyName: core.companyName,
      receiverName: core.receiverName || undefined,
      receiverEmail: core.receiverEmail || undefined,
      jobTitle: core.jobTitle || undefined,
      location: core.location || undefined,
      salary: core.salary || undefined,
      linkedinUrl: core.linkedinUrl || undefined,
      jobUrl: core.jobUrl || undefined,
      jobDescription: core.jobDescription || undefined,
      notes: core.notes || undefined,
      campaignId: core.campaignId || undefined,
      customFields: cf,
      customFieldLabels,
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{mode === 'create' ? 'Add Lead' : 'Edit Lead'}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => void handleCreateCampaign()}>
            + Campaign
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Company *</Label>
            <Input
              value={core.companyName}
              onChange={(e) => setCore({ ...core, companyName: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Receiver Name</Label>
              <Input
                value={core.receiverName}
                onChange={(e) => setCore({ ...core, receiverName: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                value={core.receiverEmail}
                onChange={(e) => setCore({ ...core, receiverEmail: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Job Title</Label>
              <Input value={core.jobTitle} onChange={(e) => setCore({ ...core, jobTitle: e.target.value })} />
            </div>
            <div>
              <Label>Location</Label>
              <Input value={core.location} onChange={(e) => setCore({ ...core, location: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Salary</Label>
            <Input value={core.salary} onChange={(e) => setCore({ ...core, salary: e.target.value })} />
          </div>

          {visibleCoreFields
            .filter((f) => !PRIMARY_CORE_FIELDS.includes(f as never))
            .map((field) => (
              <div key={field}>
                <Label>{LEAD_CORE_FIELD_LABELS[field]}</Label>
                {MULTILINE_CORE_FIELDS.has(field) ? (
                  <Textarea
                    value={core[field as keyof CoreFieldState]}
                    onChange={(e) => setCore({ ...core, [field]: e.target.value })}
                  />
                ) : (
                  <Input
                    value={core[field as keyof CoreFieldState]}
                    onChange={(e) => setCore({ ...core, [field]: e.target.value })}
                  />
                )}
              </div>
            ))}

          <div>
            <Label>Campaign</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
              value={core.campaignId}
              onChange={(e) => setCore({ ...core, campaignId: e.target.value })}
            >
              <option value="">— none —</option>
              {campaigns?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Template</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
              value={templateId}
              onChange={(e) => void onTemplateChange(e.target.value)}
            >
              <option value="">— none —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Selecting a template exposes the fields it needs below.
            </p>
          </div>
        </CardContent>
      </Card>

      {selectedTemplate && templateFieldNames.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Template Fields</CardTitle>
            <CardDescription>
              Required by &quot;{selectedTemplate.name}&quot; — auto-detected from its {'{{variableName}}'}{' '}
              syntax.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {templateFieldNames.map((varName) => (
              <div key={varName}>
                <Label>{customFieldLabels[varName] ?? humanizeKey(varName)}</Label>
                <Input
                  value={customFields[varName] ?? ''}
                  onChange={(e) => setCustomFields((prev) => ({ ...prev, [varName]: e.target.value }))}
                  placeholder={`{{${varName}}}`}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Custom Fields</CardTitle>
          <CardDescription>Arbitrary per-lead data not tied to any specific template.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {orphanCustomFieldKeys.length === 0 && (
            <p className="text-sm text-muted-foreground">No custom fields yet.</p>
          )}
          {orphanCustomFieldKeys.map((key) => (
            <div key={key} className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="flex items-center gap-2">
                  {customFieldLabels[key] ?? humanizeKey(key)}
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {key}
                  </Badge>
                </Label>
                <Input
                  value={customFields[key] ?? ''}
                  onChange={(e) => setCustomFields((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleDeleteCustomField(key)}
                aria-label={`Remove ${key}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div className="flex items-end gap-2 rounded-md border border-dashed p-3">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Field name</Label>
              <Input
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder="e.g. Notice Period"
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Value</Label>
              <Input value={newFieldValue} onChange={(e) => setNewFieldValue(e.target.value)} />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleAddCustomField}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
          {newFieldError && <p className="text-sm text-destructive">{newFieldError}</p>}
        </CardContent>
      </Card>

      <Button onClick={handleSubmit} disabled={submitting || !core.companyName}>
        {submitLabel ?? (mode === 'create' ? 'Add Lead' : 'Save Changes')}
      </Button>
    </div>
  );
}
