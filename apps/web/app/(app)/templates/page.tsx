'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { templatesApi, type EmailTemplate } from '@/lib/api';
import { Plus } from 'lucide-react';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);

  const load = useCallback(async () => {
    setTemplates(await templatesApi.list());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createNew = async () => {
    const t = await templatesApi.create({
      name: 'New Template',
      subject: 'Application for {{jobTitle}} at {{companyName}}',
      bodyHtml: '<p>Hi {{receiverName}},</p><p>I am writing to express my interest in the {{jobTitle}} role at {{companyName}}.</p><p>Regards</p>',
    });
    window.location.href = `/templates/${t.id}`;
  };

  return (
    <>
      <PageHeader title="Templates" description="Create email templates with dynamic {{variables}}." />
      <div className="p-8 space-y-4">
        <Button onClick={() => void createNew()}>
          <Plus className="mr-2 h-4 w-4" /> New Template
        </Button>
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <Link key={t.id} href={`/templates/${t.id}`}>
              <Card className="hover:border-primary transition-colors cursor-pointer h-full">
                <CardHeader>
                  <CardTitle className="text-base">{t.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground truncate">{t.subject}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.detectedVars.map((v) => (
                      <Badge key={v} variant="secondary" className="text-xs font-mono">{v}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
