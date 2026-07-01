-- Phase 0 initial schema: all Phase 1 tables with indexes for filter/sort columns.

-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('NEW', 'READY_TO_APPLY', 'APPLIED', 'REPLIED', 'INTERVIEW', 'REJECTED', 'OFFER');

-- CreateEnum
CREATE TYPE "EmailLogStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "GeneratedEmailStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailFailureReason" AS ENUM ('INVALID_EMAIL', 'GMAIL_LIMIT', 'TIMEOUT', 'NETWORK_ERROR', 'ATTACHMENT_ERROR', 'MISSING_VARIABLES', 'GMAIL_NOT_CONNECTED', 'DRAFT_NOT_APPROVED', 'DRAFT_INVALID');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmailAccount" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "email" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiry" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "fileSize" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLead" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "companyName" TEXT NOT NULL,
    "receiverName" TEXT,
    "receiverEmail" TEXT,
    "jobTitle" TEXT,
    "location" TEXT,
    "salary" TEXT,
    "linkedinUrl" TEXT,
    "jobUrl" TEXT,
    "jobDescription" TEXT,
    "notes" TEXT,
    "pipelineStatus" "PipelineStatus" NOT NULL DEFAULT 'NEW',
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyPlainText" TEXT,
    "detectedVars" TEXT[],
    "variableMap" JSONB NOT NULL DEFAULT '{}',
    "defaultValues" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedEmail" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "leadId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "buildBatchId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyPlainText" TEXT,
    "previewHash" TEXT NOT NULL,
    "status" "GeneratedEmailStatus" NOT NULL DEFAULT 'DRAFT',
    "isValid" BOOLEAN NOT NULL DEFAULT false,
    "missingVariables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resolvedVariables" JSONB NOT NULL DEFAULT '{}',
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "jobLeadId" TEXT,
    "companyName" TEXT NOT NULL,
    "position" TEXT,
    "receiverName" TEXT,
    "receiverEmail" TEXT,
    "resumeId" TEXT,
    "templateId" TEXT,
    "generatedEmailId" TEXT,
    "status" "PipelineStatus" NOT NULL DEFAULT 'APPLIED',
    "appliedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "jobLeadId" TEXT,
    "templateId" TEXT,
    "resumeId" TEXT,
    "generatedEmailId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyPlainText" TEXT,
    "status" "EmailLogStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" "EmailFailureReason",
    "failureMessage" TEXT,
    "gmailMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "bulkSendId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_name_idx" ON "Campaign"("name");

-- CreateIndex
CREATE INDEX "JobLead_campaignId_idx" ON "JobLead"("campaignId");

-- CreateIndex
CREATE INDEX "JobLead_pipelineStatus_idx" ON "JobLead"("pipelineStatus");

-- CreateIndex
CREATE INDEX "JobLead_companyName_idx" ON "JobLead"("companyName");

-- CreateIndex
CREATE INDEX "JobLead_jobTitle_idx" ON "JobLead"("jobTitle");

-- CreateIndex
CREATE INDEX "JobLead_receiverName_idx" ON "JobLead"("receiverName");

-- CreateIndex
CREATE INDEX "JobLead_receiverEmail_idx" ON "JobLead"("receiverEmail");

-- CreateIndex
CREATE INDEX "JobLead_createdAt_idx" ON "JobLead"("createdAt");

-- CreateIndex
CREATE INDEX "GeneratedEmail_campaignId_idx" ON "GeneratedEmail"("campaignId");

-- CreateIndex
CREATE INDEX "GeneratedEmail_leadId_idx" ON "GeneratedEmail"("leadId");

-- CreateIndex
CREATE INDEX "GeneratedEmail_templateId_idx" ON "GeneratedEmail"("templateId");

-- CreateIndex
CREATE INDEX "GeneratedEmail_status_idx" ON "GeneratedEmail"("status");

-- CreateIndex
CREATE INDEX "GeneratedEmail_buildBatchId_idx" ON "GeneratedEmail"("buildBatchId");

-- CreateIndex
CREATE INDEX "GeneratedEmail_isValid_idx" ON "GeneratedEmail"("isValid");

-- CreateIndex
CREATE INDEX "GeneratedEmail_createdAt_idx" ON "GeneratedEmail"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_generatedEmailId_key" ON "Application"("generatedEmailId");

-- CreateIndex
CREATE INDEX "Application_campaignId_idx" ON "Application"("campaignId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX "Application_appliedDate_idx" ON "Application"("appliedDate");

-- CreateIndex
CREATE INDEX "Application_companyName_idx" ON "Application"("companyName");

-- CreateIndex
CREATE UNIQUE INDEX "EmailLog_generatedEmailId_key" ON "EmailLog"("generatedEmailId");

-- CreateIndex
CREATE INDEX "EmailLog_campaignId_idx" ON "EmailLog"("campaignId");

-- CreateIndex
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");

-- CreateIndex
CREATE INDEX "EmailLog_bulkSendId_idx" ON "EmailLog"("bulkSendId");

-- CreateIndex
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_recipientEmail_idx" ON "EmailLog"("recipientEmail");

-- AddForeignKey
ALTER TABLE "JobLead" ADD CONSTRAINT "JobLead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedEmail" ADD CONSTRAINT "GeneratedEmail_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedEmail" ADD CONSTRAINT "GeneratedEmail_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "JobLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedEmail" ADD CONSTRAINT "GeneratedEmail_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedEmail" ADD CONSTRAINT "GeneratedEmail_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobLeadId_fkey" FOREIGN KEY ("jobLeadId") REFERENCES "JobLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_generatedEmailId_fkey" FOREIGN KEY ("generatedEmailId") REFERENCES "GeneratedEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_jobLeadId_fkey" FOREIGN KEY ("jobLeadId") REFERENCES "JobLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_generatedEmailId_fkey" FOREIGN KEY ("generatedEmailId") REFERENCES "GeneratedEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;
