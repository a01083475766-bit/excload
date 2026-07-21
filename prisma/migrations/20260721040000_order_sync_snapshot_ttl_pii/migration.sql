-- AlterTable
ALTER TABLE "OrderSyncOrder" ADD COLUMN "lastCourierDownloadAt" TIMESTAMP(3),
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "piiClearedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "OrderSyncOrder_expiresAt_idx" ON "OrderSyncOrder"("expiresAt");

-- CreateIndex
CREATE INDEX "OrderSyncOrder_transmissionStatus_piiClearedAt_idx" ON "OrderSyncOrder"("transmissionStatus", "piiClearedAt");
