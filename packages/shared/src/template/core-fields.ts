/** Canonical list of standard Lead fields — single source of truth for API, template, and UI code. */
export const LEAD_CORE_FIELDS = [
  'companyName',
  'receiverName',
  'receiverEmail',
  'jobTitle',
  'location',
  'salary',
  'linkedinUrl',
  'jobUrl',
  'jobDescription',
  'notes',
] as const;

export type LeadCoreField = (typeof LEAD_CORE_FIELDS)[number];

/** Human-readable labels for standard Lead fields, keyed by field name. */
export const LEAD_CORE_FIELD_LABELS: Record<LeadCoreField, string> = {
  companyName: 'Company',
  receiverName: 'Receiver Name',
  receiverEmail: 'Receiver Email',
  jobTitle: 'Job Title',
  location: 'Location',
  salary: 'Salary',
  linkedinUrl: 'LinkedIn URL',
  jobUrl: 'Job URL',
  jobDescription: 'Job Description',
  notes: 'Notes',
};
