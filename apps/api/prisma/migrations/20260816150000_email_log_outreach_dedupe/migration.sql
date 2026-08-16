-- Idempotency guard: a single lead must never receive more than one send for the
-- same (template, campaign) outreach, even when multiple GeneratedEmail drafts exist
-- for that lead (e.g. a second "Build Emails" run over an already-emailed lead).
--
-- This is a partial, expression-based unique index, which Prisma's schema language
-- (prisma/schema.prisma) cannot express directly. It is intentionally not mirrored
-- as an `@@unique` in schema.prisma -- see the comment on the EmailLog model.
--
-- - COALESCE(...) normalizes NULL templateId/campaignId so rows with no template or
--   no campaign still dedupe correctly (Postgres treats NULLs in a plain unique
--   index as distinct, which would silently defeat the constraint for those rows).
-- - The WHERE clause scopes the constraint to SENDING (claimed/in-flight) and SENT
--   (completed) rows only, so FAILED attempts never block a legitimate retry, and
--   deleting/replacing a draft doesn't leave stale rows blocking future sends.
-- - jobLeadId IS NOT NULL excludes EmailLog rows whose lead was later deleted
--   (jobLeadId is nullable via onDelete: SetNull).
--
-- One pre-existing historical violation was found in the dev database: lead
-- cmsujcqyg000104jm7nn89ipi was genuinely double-sent (two distinct Gmail message
-- IDs, ~99 minutes apart) before this fix existed. Per instruction, that row is left
-- untouched rather than edited/deleted -- it is explicitly grandfathered out of this
-- constraint's domain by id so the index can be created without altering any data.
CREATE UNIQUE INDEX "EmailLog_active_outreach_key"
ON "EmailLog" ("userId", "jobLeadId", COALESCE("templateId", ''), COALESCE("campaignId", ''))
WHERE status IN ('SENDING', 'SENT')
  AND "jobLeadId" IS NOT NULL
  AND id NOT IN ('cmsun5oap000004l2iil4yaoc');

-- CreateIndex (non-unique, query-support companion for the @@index in schema.prisma)
CREATE INDEX "EmailLog_userId_jobLeadId_templateId_campaignId_idx" ON "EmailLog"("userId", "jobLeadId", "templateId", "campaignId");
