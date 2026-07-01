import type { PipelineStatus } from '../constants/pipeline-status';
import type { GeneratedEmailStatus } from '../constants/generated-email-status';
import type { EmailLogStatus, EmailFailureReason } from '../constants/email-log-status';

/** Standard API success envelope for consistent client parsing. */
export interface ApiResponse<T> {
  success: true;
  data: T;
}

/** Standard API error envelope — mirrors server AppError shape. */
export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

export type SortOrder = 'asc' | 'desc';

/**
 * Shared list-query parameters used across leads, applications, email logs,
 * and generated emails endpoints. Parsed once on the server via Zod.
 */
export interface ListQueryParams {
  search?: string;
  status?: PipelineStatus | PipelineStatus[];
  campaignId?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: SortOrder;
}

/** Health check payload returned by GET /api/v1/health */
export interface HealthCheckResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  database: {
    connected: boolean;
    latencyMs?: number;
  };
  version: string;
}

/** Resolved template variable metadata — used in build/preview responses (Phase 3+). */
export interface ResolvedVariable {
  value: string;
  source: string;
}

export type {
  PipelineStatus,
  GeneratedEmailStatus,
  EmailLogStatus,
  EmailFailureReason,
};
