import { z } from 'zod';
import { parsePipelineStatusFilter } from '../constants/pipeline-status';
import { parseLeadSourceFilter } from '../constants/lead-source';

/** Default page size — balances payload size vs. round trips. */
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

const sortOrderSchema = z.enum(['asc', 'desc']).default('asc');

/**
 * Zod schema for shared list query params.
 * Coerces string query values to numbers; caps limit to prevent unbounded scans.
 */
export const listQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  status: z
    .string()
    .optional()
    .transform((v) => parsePipelineStatusFilter(v)),
  campaignId: z.string().cuid().optional(),
  source: z
    .string()
    .optional()
    .transform((v) => parseLeadSourceFilter(v)),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  sortBy: z.string().trim().max(64).optional(),
  sortOrder: sortOrderSchema,
});

export type ParsedListQuery = z.infer<typeof listQuerySchema>;

/**
 * Parse and validate list query params from Express req.query.
 * Throws ZodError on invalid input — caught by error handler middleware.
 */
export function parseListQuery(query: Record<string, unknown>): ParsedListQuery {
  return listQuerySchema.parse(query);
}

/**
 * Compute SQL OFFSET from page/limit — O(1).
 * Used by Prisma: skip: offset, take: limit.
 */
export function paginationOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * Build pagination metadata for list responses.
 */
export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): { total: number; page: number; limit: number; totalPages: number; hasMore: boolean } {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    total,
    page,
    limit,
    totalPages,
    hasMore: page < totalPages,
  };
}
