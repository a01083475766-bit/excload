-- Voucher email send tracking (no plaintext codes / full emails)

CREATE TABLE "VoucherEmailSend" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "recipientEmailHash" TEXT NOT NULL,
    "recipientEmailMasked" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "errorCode" TEXT,
    "voucherIds" JSONB NOT NULL,
    "externalOrderIds" JSONB NOT NULL,
    "codeLast4s" JSONB NOT NULL,
    "actorId" TEXT,
    "forceResend" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoucherEmailSend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VoucherEmailSend_campaignId_dedupeKey_key" ON "VoucherEmailSend"("campaignId", "dedupeKey");
CREATE INDEX "VoucherEmailSend_campaignId_recipientEmailHash_status_idx" ON "VoucherEmailSend"("campaignId", "recipientEmailHash", "status");
CREATE INDEX "VoucherEmailSend_campaignId_status_createdAt_idx" ON "VoucherEmailSend"("campaignId", "status", "createdAt");
CREATE INDEX "VoucherEmailSend_status_createdAt_idx" ON "VoucherEmailSend"("status", "createdAt");

ALTER TABLE "VoucherEmailSend" ADD CONSTRAINT "VoucherEmailSend_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "VoucherCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
