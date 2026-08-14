'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { matchLeadField } from '@/lib/variable-field-match';

interface VariableMapperProps {
  variables: string[];
  variableMap: Record<string, string>;
  defaultValues: Record<string, string>;
  coreFields: string[];
  customFields: string[];
  onMapChange: (map: Record<string, string>) => void;
  onDefaultChange: (defaults: Record<string, string>) => void;
}

/** Map detected template variables to lead fields or static defaults. */
export function VariableMapper({
  variables,
  variableMap,
  defaultValues,
  coreFields,
  customFields,
  onMapChange,
  onDefaultChange,
}: VariableMapperProps) {
  if (variables.length === 0) {
    return <p className="text-sm text-muted-foreground">No variables detected yet.</p>;
  }

  const sourceOptions = [
    ...coreFields.map((f) => ({ value: f, label: f })),
    ...customFields.map((f) => ({ value: `customFields.${f}`, label: `custom: ${f}` })),
    { value: '__default__', label: 'Static default only' },
  ];

  return (
    <div className="space-y-4">
      {variables.map((varName) => {
        const currentValue = variableMap[varName] ?? '';
        const exactMatch = matchLeadField(varName, coreFields, customFields);
        const isAutoMatched = Boolean(exactMatch) && currentValue === exactMatch;
        const isCustom = Boolean(currentValue) && !isAutoMatched;

        return (
          <div key={varName} className="grid gap-2 rounded-md border p-3 md:grid-cols-3">
            <div className="flex items-center gap-2">
              <Label className="font-mono text-primary">{`{{${varName}}}`}</Label>
              {isAutoMatched && (
                <Badge variant="secondary" className="text-[10px]">
                  Auto-matched
                </Badge>
              )}
              {isCustom && (
                <Badge variant="outline" className="text-[10px]">
                  Custom
                </Badge>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Map to lead field</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={currentValue}
                onChange={(e) => onMapChange({ ...variableMap, [varName]: e.target.value })}
              >
                <option value="">— select —</option>
                {sourceOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Default fallback</Label>
              <Input
                className="mt-1"
                value={defaultValues[varName] ?? ''}
                placeholder="Optional default"
                onChange={(e) => onDefaultChange({ ...defaultValues, [varName]: e.target.value })}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
