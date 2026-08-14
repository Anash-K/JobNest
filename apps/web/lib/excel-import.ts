import * as XLSX from 'xlsx';
import { normalizeFieldName } from '@jobhunter/shared';
import type { ImportLeadRow } from '@/lib/api';

export type ParsedSpreadsheetRow = ImportLeadRow & {
  _rowNumber: number;
  /** Original header -> cell value for this row, kept so a variable can be remapped after parsing. */
  _raw: Record<string, string>;
};

/** Canonical column aliases → lead field keys */
const COLUMN_MAP: Record<string, keyof ImportLeadRow | 'custom'> = {
  company: 'companyName',
  'company name': 'companyName',
  companyname: 'companyName',
  organization: 'companyName',
  employer: 'companyName',
  receiver: 'receiverName',
  'receiver name': 'receiverName',
  recipient: 'receiverName',
  'contact name': 'receiverName',
  name: 'receiverName',
  recruiter: 'receiverName',
  email: 'receiverEmail',
  'receiver email': 'receiverEmail',
  'contact email': 'receiverEmail',
  'email address': 'receiverEmail',
  position: 'jobTitle',
  'job title': 'jobTitle',
  title: 'jobTitle',
  role: 'jobTitle',
  salary: 'salary',
  compensation: 'salary',
  pay: 'salary',
  location: 'location',
  city: 'location',
  linkedin: 'linkedinUrl',
  'linkedin url': 'linkedinUrl',
  'job url': 'jobUrl',
  'application url': 'jobUrl',
  url: 'jobUrl',
  description: 'jobDescription',
  'job description': 'jobDescription',
  notes: 'notes',
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function cellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function mapRow(
  raw: Record<string, unknown>,
  headers: string[],
  templateVars: string[] = [],
): ParsedSpreadsheetRow | null {
  const mapped: Partial<ImportLeadRow> = {};
  const customFields: Record<string, unknown> = {};
  const customFieldLabels: Record<string, string> = {};
  const rawByHeader: Record<string, string> = {};

  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (!key) return;
    const value = cellValue(raw[`__col_${index}`]);
    if (value) rawByHeader[header] = value;
    if (!value) return;

    const field = COLUMN_MAP[key];
    if (field && field !== 'custom') {
      (mapped as Record<string, string>)[field] = value;
      return;
    }

    // Not a known core-field alias — check for an exact match against the
    // selected template's variable names before falling back to a raw-header key.
    const varMatch = templateVars.find((varName) => normalizeFieldName(header) === varName);
    if (varMatch) {
      customFields[varMatch] = value;
      customFieldLabels[varMatch] = header;
    } else {
      customFields[header] = value;
    }
  });

  if (!mapped.companyName) return null;

  return {
    companyName: mapped.companyName,
    receiverName: mapped.receiverName,
    receiverEmail: mapped.receiverEmail,
    jobTitle: mapped.jobTitle,
    location: mapped.location,
    salary: mapped.salary,
    linkedinUrl: mapped.linkedinUrl,
    jobUrl: mapped.jobUrl,
    jobDescription: mapped.jobDescription,
    notes: mapped.notes,
    customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
    customFieldLabels: Object.keys(customFieldLabels).length > 0 ? customFieldLabels : undefined,
    _rowNumber: 0,
    _raw: rawByHeader,
  };
}

export function parseSpreadsheetFile(
  file: File,
  templateVars: string[] = [],
): Promise<ParsedSpreadsheetRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        if (!data) {
          reject(new Error('Unable to read file contents'));
          return;
        }

        const workbook = XLSX.read(data, { type: 'array', cellDates: false });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          reject(new Error('Spreadsheet contains no worksheets'));
          return;
        }

        const sheet = workbook.Sheets[sheetName];
        const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
          header: 1,
          defval: '',
          blankrows: false,
        });

        if (matrix.length < 2) {
          reject(new Error('Spreadsheet must include a header row and at least one data row'));
          return;
        }

        const headerRow = matrix[0] ?? [];
        const headers = headerRow.map((cell) => cellValue(cell));

        const rows: ParsedSpreadsheetRow[] = [];

        matrix.slice(1).forEach((dataRow, index) => {
          const raw: Record<string, unknown> = {};
          headers.forEach((_, colIndex) => {
            raw[`__col_${colIndex}`] = dataRow[colIndex];
          });

          const parsed = mapRow(raw, headers, templateVars);
          if (parsed) {
            rows.push({ ...parsed, _rowNumber: index + 2 });
          }
        });

        if (rows.length === 0) {
          reject(new Error('No valid rows found. Ensure a Company column is present.'));
          return;
        }

        resolve(rows);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Failed to parse spreadsheet'));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function isSpreadsheetFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.csv') ||
    file.type.includes('spreadsheet') ||
    file.type === 'text/csv' ||
    file.type === 'application/vnd.ms-excel'
  );
}

export function toImportPayload(rows: ParsedSpreadsheetRow[]): ImportLeadRow[] {
  return rows.map(({ _rowNumber: _ignored, _raw: _ignoredRaw, ...row }) => row);
}

/** Which of a template's detected variables are already present, across at least one parsed row. */
export function resolvedTemplateVars(
  rows: ParsedSpreadsheetRow[],
  templateVars: string[],
  coreFields: string[],
): Set<string> {
  const resolved = new Set<string>();
  for (const varName of templateVars) {
    if (coreFields.includes(varName)) {
      resolved.add(varName);
      continue;
    }
    if (rows.some((row) => String(row.customFields?.[varName] ?? '').length > 0)) {
      resolved.add(varName);
    }
  }
  return resolved;
}

/** Manually map an existing CSV column to a template variable that wasn't auto-detected. */
export function applyColumnOverride(
  rows: ParsedSpreadsheetRow[],
  header: string,
  varName: string,
): ParsedSpreadsheetRow[] {
  return rows.map((row) => {
    const value = row._raw[header];
    if (!value) return row;
    return {
      ...row,
      customFields: { ...(row.customFields ?? {}), [varName]: value },
      customFieldLabels: { ...(row.customFieldLabels ?? {}), [varName]: header },
    };
  });
}

/** Apply one fallback value to every row missing a given variable. */
export function applyDefaultValue(
  rows: ParsedSpreadsheetRow[],
  varName: string,
  defaultValue: string,
): ParsedSpreadsheetRow[] {
  if (!defaultValue) return rows;
  return rows.map((row) => {
    if (String(row.customFields?.[varName] ?? '').length > 0) return row;
    return { ...row, customFields: { ...(row.customFields ?? {}), [varName]: defaultValue } };
  });
}
