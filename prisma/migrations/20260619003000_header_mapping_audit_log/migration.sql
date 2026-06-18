-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "HeaderMappingStatus" AS ENUM (
    'AUTO_MATCHED',
    'LOW_CONFIDENCE',
    'UNMAPPED',
    'NEEDS_REVIEW',
    'CONFIRMED',
    'IGNORED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "HeaderMappingMethod" AS ENUM (
    'BASE_HEADER',
    'DB_ALIAS',
    'STATIC_ALIAS',
    'AI',
    'REFINED',
    'UNMAPPED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "HeaderSampleValueType" AS ENUM (
    'DATE',
    'MONEY',
    'PHONE',
    'ADDRESS',
    'NAME',
    'MESSAGE',
    'CODE',
    'STATUS',
    'TEXT',
    'EMPTY'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "HeaderMappingAdminStatus" AS ENUM (
    'PENDING',
    'CONFIRMED',
    'CHANGED',
    'IGNORED',
    'HOLD'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "HeaderMappingAuditLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "fileHash" TEXT,
  "source" TEXT,
  "totalHeaders" INTEGER NOT NULL,
  "autoMatchedCount" INTEGER NOT NULL,
  "unmappedCount" INTEGER NOT NULL,
  "lowConfidenceCount" INTEGER NOT NULL,
  "needsReviewCount" INTEGER NOT NULL,
  "entriesWithMaskedSamplesCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),

  CONSTRAINT "HeaderMappingAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HeaderMappingAuditEntry" (
  "id" TEXT NOT NULL,
  "auditLogId" TEXT NOT NULL,
  "originalHeader" TEXT NOT NULL,
  "baseHeader" TEXT,
  "status" "HeaderMappingStatus" NOT NULL,
  "method" "HeaderMappingMethod" NOT NULL,
  "confidenceReason" TEXT,
  "sampleValueType" "HeaderSampleValueType" NOT NULL,
  "maskedSamples" JSONB NOT NULL,
  "sampleCount" INTEGER NOT NULL,
  "hasMaskedSamples" BOOLEAN NOT NULL,
  "adminStatus" "HeaderMappingAdminStatus" NOT NULL DEFAULT 'PENDING',
  "adminMemo" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HeaderMappingAuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HeaderMappingAuditLog_createdAt_idx" ON "HeaderMappingAuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "HeaderMappingAuditLog_expiresAt_idx" ON "HeaderMappingAuditLog"("expiresAt");
CREATE INDEX IF NOT EXISTS "HeaderMappingAuditLog_fileHash_idx" ON "HeaderMappingAuditLog"("fileHash");
CREATE INDEX IF NOT EXISTS "HeaderMappingAuditLog_source_idx" ON "HeaderMappingAuditLog"("source");
CREATE INDEX IF NOT EXISTS "HeaderMappingAuditLog_userId_idx" ON "HeaderMappingAuditLog"("userId");

CREATE INDEX IF NOT EXISTS "HeaderMappingAuditEntry_auditLogId_idx" ON "HeaderMappingAuditEntry"("auditLogId");
CREATE INDEX IF NOT EXISTS "HeaderMappingAuditEntry_originalHeader_idx" ON "HeaderMappingAuditEntry"("originalHeader");
CREATE INDEX IF NOT EXISTS "HeaderMappingAuditEntry_baseHeader_idx" ON "HeaderMappingAuditEntry"("baseHeader");
CREATE INDEX IF NOT EXISTS "HeaderMappingAuditEntry_status_idx" ON "HeaderMappingAuditEntry"("status");
CREATE INDEX IF NOT EXISTS "HeaderMappingAuditEntry_method_idx" ON "HeaderMappingAuditEntry"("method");
CREATE INDEX IF NOT EXISTS "HeaderMappingAuditEntry_sampleValueType_idx" ON "HeaderMappingAuditEntry"("sampleValueType");
CREATE INDEX IF NOT EXISTS "HeaderMappingAuditEntry_adminStatus_idx" ON "HeaderMappingAuditEntry"("adminStatus");
CREATE INDEX IF NOT EXISTS "HeaderMappingAuditEntry_createdAt_idx" ON "HeaderMappingAuditEntry"("createdAt");

-- AddForeignKey
ALTER TABLE "HeaderMappingAuditLog" DROP CONSTRAINT IF EXISTS "HeaderMappingAuditLog_userId_fkey";
ALTER TABLE "HeaderMappingAuditLog" ADD CONSTRAINT "HeaderMappingAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HeaderMappingAuditEntry" DROP CONSTRAINT IF EXISTS "HeaderMappingAuditEntry_auditLogId_fkey";
ALTER TABLE "HeaderMappingAuditEntry" ADD CONSTRAINT "HeaderMappingAuditEntry_auditLogId_fkey" FOREIGN KEY ("auditLogId") REFERENCES "HeaderMappingAuditLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
