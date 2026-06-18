-- AlterTable
ALTER TABLE "HeaderMappingAuditEntry"
  ADD COLUMN IF NOT EXISTS "adminSelectedBaseHeader" TEXT,
  ADD COLUMN IF NOT EXISTS "adminSelectedAt" TIMESTAMP(3);
