'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { useLeads } from '@/hooks/queries/use-leads';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { describeLead, type AutofillMode } from '@/lib/lead-autofill';
import type { JobLead } from '@/lib/api';

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;

interface LeadAutofillSearchProps {
  selectedLead: JobLead | null;
  onSelect: (lead: JobLead) => void;
  onClear: () => void;
  mode: AutofillMode;
  onModeChange: (mode: AutofillMode) => void;
}

/** Searchable combobox for copying an existing lead's data onto the Add Lead form. Never mutates the source lead. */
export function LeadAutofillSearch({
  selectedLead,
  onSelect,
  onClear,
  mode,
  onModeChange,
}: LeadAutofillSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const canSearch = debouncedQuery.trim().length >= MIN_QUERY_LENGTH;

  const { data, isFetching } = useLeads(
    { search: debouncedQuery.trim(), limit: '8' },
    { enabled: open && canSearch },
  );
  const results = data?.items ?? [];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (lead: JobLead) => {
    onSelect(lead);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Label>Auto-fill from existing lead</Label>

      {selectedLead ? (
        <div className="mt-1 flex items-start justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
          <div>
            <p className="text-sm font-medium">{selectedLead.companyName}</p>
            <p className="text-xs text-muted-foreground">{describeLead(selectedLead) || '—'}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Copied into the form below — every field stays editable before you submit.
            </p>
          </div>
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear selected lead"
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative mt-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            role="combobox"
            aria-expanded={open}
            aria-controls="lead-autofill-results"
            aria-autocomplete="list"
            className="h-10 w-full rounded-md border pl-9 pr-3 text-sm"
            placeholder="Search by company, name, email, or job title…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false);
                e.currentTarget.blur();
              }
            }}
          />
        </div>
      )}

      {open && !selectedLead && canSearch && (
        <div
          id="lead-autofill-results"
          role="listbox"
          className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover shadow-md"
        >
          {isFetching && <p className="p-3 text-sm text-muted-foreground">Searching…</p>}
          {!isFetching && results.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">No matching leads.</p>
          )}
          {!isFetching &&
            results.map((lead) => (
              <button
                key={lead.id}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => handleSelect(lead)}
                className="block w-full border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
              >
                <p className="font-medium">{lead.companyName}</p>
                <p className="text-xs text-muted-foreground">
                  {[lead.receiverName, lead.jobTitle, lead.receiverEmail].filter(Boolean).join(' · ')}
                </p>
              </button>
            ))}
        </div>
      )}
      {open && !selectedLead && !canSearch && query.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover p-3 text-sm text-muted-foreground shadow-md">
          Keep typing to search…
        </div>
      )}

      {selectedLead && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="text-muted-foreground">On selection:</span>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="autofill-mode"
              checked={mode === 'missing'}
              onChange={() => onModeChange('missing')}
            />
            Auto-fill missing fields only
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="autofill-mode"
              checked={mode === 'replace'}
              onChange={() => onModeChange('replace')}
            />
            Replace all fields
          </label>
        </div>
      )}
    </div>
  );
}
