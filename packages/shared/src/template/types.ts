import type { ResolvedVariable } from '../types';

/** Lead shape used by the template engine — decoupled from Prisma. */
export interface TemplateLead {
  companyName: string;
  receiverName?: string | null;
  receiverEmail?: string | null;
  jobTitle?: string | null;
  location?: string | null;
  salary?: string | null;
  linkedinUrl?: string | null;
  jobUrl?: string | null;
  jobDescription?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

export type VariableMap = Record<string, string>;
export type DefaultValues = Record<string, string>;

export interface VariableResolution {
  context: Record<string, string>;
  resolved: Record<string, ResolvedVariable>;
  missing: string[];
}
