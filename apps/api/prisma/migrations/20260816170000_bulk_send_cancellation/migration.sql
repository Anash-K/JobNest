-- CreateEnum
CREATE TYPE "BulkSendStatus" AS ENUM ('RUNNING', 'CANCELLING', 'COMPLETED', 'CANCELLED');

-- CreateTable
-- Durable record of a bulk-send operation's lifecycle, keyed by the same id used as
-- EmailLog.bulkSendId. Not a FK to EmailLog: EmailLog.bulkSendId predates this table and
-- historical rows have no corresponding BulkSend record.
CREATE TABLE "BulkSend" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BulkSendStatus" NOT NULL DEFAULT 'RUNNING',
    "total" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BulkSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkSend_userId_idx" ON "BulkSend"("userId");

-- CreateIndex
CREATE INDEX "BulkSend_userId_status_idx" ON "BulkSend"("userId", "status");

-- AddForeignKey
ALTER TABLE "BulkSend" ADD CONSTRAINT "BulkSend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
