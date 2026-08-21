-- Voucher import batch tracking (no plaintext codes / PII)

CREATE TABLE "VoucherImportBatch" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "actorId" TEXT,
    "fileName" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "newCount" INTEGER NOT NULL DEFAULT 0,
    "existingCount" INTEGER NOT NULL DEFAULT 0,
    "conflictCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledCount" INTEGER NOT NULL DEFAULT 0,
    "summaryJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoucherImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoucherImportBatch_campaignId_createdAt_idx" ON "VoucherImportBatch"("campaignId", "createdAt");
CREATE INDEX "VoucherImportBatch_kind_status_idx" ON "VoucherImportBatch"("kind", "status");

ALTER TABLE "VoucherImportBatch" ADD CONSTRAINT "VoucherImportBatch_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "VoucherCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
