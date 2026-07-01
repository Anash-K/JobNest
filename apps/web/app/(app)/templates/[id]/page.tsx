'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TiptapEditor } from '@/components/templates/TiptapEditor';
import { VariableMapper } from '@/components/templates/VariableMapper';
import { templatesApi, type EmailTemplate } from '@/lib/api';

export default function TemplateEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [coreFields, setCoreFields] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const [t, sources] = await Promise.all([templatesApi.get(id), templatesApi.getSources()]);
    setTemplate(t);
    setCoreFields(sources.coreFields);
    setCustomFields(sources.customFields);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = () => {
    if (!template) return;
    startTransition(async () => {
      const updated = await templatesApi.update(id, {
        name: template.name,
        subject: template.subject,
        bodyHtml: template.bodyHtml,
      });
      await templatesApi.updateVariableMap(id, template.variableMap);
      await templatesApi.updateDefaultValues(id, template.defaultValues);
      setTemplate(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  if (!template) return <div className="p-8">Loading…</div>;

  return (
    <>
      <PageHeader title={`Edit: ${template.name}`} description="Configure subject, body, and variable mapping." />
      <div className="mx-auto max-w-4xl space-y-6 p-8">
        <Card>
          <CardHeader><CardTitle>Template</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={template.name} onChange={(e) => setTemplate({ ...template, name: e.target.value })} />
            </div>
            <div>
              <Label>Subject</Label>
              <Input value={template.subject} onChange={(e) => setTemplate({ ...template, subject: e.target.value })} />
            </div>
            <div>
              <Label>Body</Label>
              <TiptapEditor
                content={template.bodyHtml}
                onChange={(html) => setTemplate({ ...template, bodyHtml: html })}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={isPending}>{saved ? 'Saved!' : 'Save Template'}</Button>
              <Button variant="outline" onClick={() => router.push('/templates')}>Back</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Variable Mapping</CardTitle>
          </CardHeader>
          <CardContent>
            <VariableMapper
              variables={template.detectedVars}
              variableMap={template.variableMap}
              defaultValues={template.defaultValues}
              coreFields={coreFields}
              customFields={customFields}
              onMapChange={(map) => setTemplate({ ...template, variableMap: map })}
              onDefaultChange={(defaults) => setTemplate({ ...template, defaultValues: defaults })}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
