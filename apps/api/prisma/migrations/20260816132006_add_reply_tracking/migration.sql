-- AlterEnum
ALTER TYPE "PipelineStatus" ADD VALUE 'NO_RESPONSE';

-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN     "gmailThreadId" TEXT;

-- AlterTable
ALTER TABLE "GmailAccount" ADD COLUMN     "historyId" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "needsReconnect" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EmailReply" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobLeadId" TEXT,
    "applicationId" TEXT,
    "emailLogId" TEXT,
    "gmailMessageId" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "senderName" TEXT,
    "recipientEmail" TEXT,
    "subject" TEXT,
    "bodyHtml" TEXT,
    "bodyPlainText" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailReply_gmailMessageId_key" ON "EmailReply"("gmailMessageId");

-- CreateIndex
CREATE INDEX "EmailReply_userId_isRead_idx" ON "EmailReply"("userId", "isRead");

-- CreateIndex
CREATE INDEX "EmailReply_userId_receivedAt_idx" ON "EmailReply"("userId", "receivedAt");

-- CreateIndex
CREATE INDEX "EmailReply_gmailThreadId_idx" ON "EmailReply"("gmailThreadId");

-- CreateIndex
CREATE INDEX "EmailLog_userId_gmailThreadId_idx" ON "EmailLog"("userId", "gmailThreadId");

-- CreateIndex
CREATE INDEX "EmailLog_userId_status_sentAt_idx" ON "EmailLog"("userId", "status", "sentAt");

-- AddForeignKey
ALTER TABLE "EmailReply" ADD CONSTRAINT "EmailReply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailReply" ADD CONSTRAINT "EmailReply_jobLeadId_fkey" FOREIGN KEY ("jobLeadId") REFERENCES "JobLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailReply" ADD CONSTRAINT "EmailReply_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailReply" ADD CONSTRAINT "EmailReply_emailLogId_fkey" FOREIGN KEY ("emailLogId") REFERENCES "EmailLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
