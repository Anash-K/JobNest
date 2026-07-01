'use client';

import { useCallback, useState } from 'react';
import { Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  isSpreadsheetFile,
  parseSpreadsheetFile,
  toImportPayload,
  type ParsedSpreadsheetRow,
} from '@/lib/excel-import';
import {
  useImportLeads,
  useValidateLeadImport,
} from '@/hooks/queries/use-leads';
import { useCampaigns } from '@/hooks/queries/use-campaigns';
import type { LeadImportValidation } from '@/lib/api';

type ImportStep = 'upload' | 'preview' | 'importing' | 'done';

interface LeadImportWizardProps {
  onComplete: () => void;
}

export function LeadImportWizard({ onComplete }: LeadImportWizardProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedSpreadsheetRow[]>([]);
  const [validation, setValidation] = useState<LeadImportValidation | null>(null);
  const [campaignId, setCampaignId] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; skipped?: number } | null>(
    null,
  );

  const { data: campaigns } = useCampaigns();
  const validateImport = useValidateLeadImport();
  const importLeads = useImportLeads();

  const handleFile = useCallback(
    async (file: File) => {
      setParseError(null);
      setValidation(null);
      setImportResult(null);

      if (!isSpreadsheetFile(file)) {
        setParseError('Upload an Excel (.xlsx, .xls) or CSV file.');
        return;
      }

      try {
        const parsed = await parseSpreadsheetFile(file);
        setFileName(file.name);
        setRows(parsed);
        setStep('preview');

        const result = await validateImport.mutateAsync({
          campaignId: campaignId || undefined,
          leads: toImportPayload(parsed),
        });
        setValidation(result);
      } catch (error) {
        setParseError(error instanceof Error ? error.message : 'Failed to parse file');
        setStep('upload');
      }
    },
    [campaignId, validateImport],
  );

  const revalidate = async () => {
    if (rows.length === 0) return;
    const result = await validateImport.mutateAsync({
      campaignId: campaignId || undefined,
      leads: toImportPayload(rows),
    });
    setValidation(result);
  };

  const confirmImport = async () => {
    if (!validation || validation.validCount === 0) return;
    setStep('importing');
    try {
      const result = await importLeads.mutateAsync({
        campaignId: campaignId || undefined,
        skipDuplicates: true,
        leads: validation.valid,
      });
      setImportResult(result);
      setStep('done');
      onComplete();
    } catch {
      setStep('preview');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="h-5 w-5" />
          Import from Excel / CSV
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Campaign (optional)</label>
          <select
            className="flex h-10 w-full rounded-md border px-3 text-sm"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            onBlur={() => void revalidate()}
          >
            <option value="">No campaign</option>
            {campaigns?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {step === 'upload' && (
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors hover:bg-muted/50">
            <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Drop Excel or CSV file here</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Columns: Company, Receiver, Email, Position, Salary, Location, + custom fields
            </p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            {parseError && <p className="mt-3 text-sm text-destructive">{parseError}</p>}
          </label>
        )}

        {step === 'preview' && validation && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{fileName}</Badge>
              <Badge>{validation.total} rows parsed</Badge>
              <Badge className="bg-green-600">{validation.validCount} valid</Badge>
              {validation.invalidCount > 0 && (
                <Badge variant="destructive">{validation.invalidCount} invalid</Badge>
              )}
              {validation.duplicateInBatchCount > 0 && (
                <Badge variant="outline">{validation.duplicateInBatchCount} dup (batch)</Badge>
              )}
              {validation.duplicateExistingCount > 0 && (
                <Badge variant="outline">{validation.duplicateExistingCount} dup (existing)</Badge>
              )}
            </div>

            <div className="max-h-64 overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr className="text-left">
                    <th className="p-2">#</th>
                    <th className="p-2">Company</th>
                    <th className="p-2">Receiver</th>
                    <th className="p-2">Email</th>
                    <th className="p-2">Position</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => {
                    const invalid = validation.invalid.find((item) => item.rowIndex === rowIndex);
                    const dupBatch = validation.duplicatesInBatch.find(
                      (item) => item.rowIndex === rowIndex,
                    );
                    const dupExisting = validation.duplicatesExisting.find(
                      (item) => item.rowIndex === rowIndex,
                    );

                    let status = 'Ready';
                    let statusClass = 'text-green-600';
                    if (invalid) {
                      status = invalid.errors.join(', ');
                      statusClass = 'text-destructive';
                    } else if (dupExisting) {
                      status = 'Duplicate (existing)';
                      statusClass = 'text-amber-600';
                    } else if (dupBatch) {
                      status = 'Duplicate (batch)';
                      statusClass = 'text-amber-600';
                    }

                    return (
                      <tr key={row._rowNumber} className="border-t">
                        <td className="p-2">{row._rowNumber}</td>
                        <td className="p-2 font-medium">{row.companyName}</td>
                        <td className="p-2">{row.receiverName ?? '—'}</td>
                        <td className="p-2">{row.receiverEmail ?? '—'}</td>
                        <td className="p-2">{row.jobTitle ?? '—'}</td>
                        <td className={`p-2 ${statusClass}`}>{status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {validation.invalid.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Invalid rows will be skipped
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('upload')}>
                Choose another file
              </Button>
              <Button
                onClick={() => void confirmImport()}
                disabled={validation.validCount === 0 || importLeads.isPending}
              >
                Import {validation.validCount} leads
              </Button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Importing leads…
          </div>
        )}

        {step === 'done' && importResult && (
          <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 p-4 text-sm">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Import complete</p>
              <p className="text-muted-foreground">
                {importResult.imported} leads imported
                {importResult.skipped ? `, ${importResult.skipped} skipped` : ''}.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
