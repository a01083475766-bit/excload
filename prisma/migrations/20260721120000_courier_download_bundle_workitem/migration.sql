-- CourierDownloadBundle / WorkItem + ShipmentUploadBatch.downloadBundleId
-- WorkItem 출처 enum은 OrderSyncBatchSourceType과 분리

CREATE TYPE "CourierDownloadWorkItemSource" AS ENUM ('API', 'EXCEL', 'TEXT');

CREATE TABLE "CourierDownloadBundle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courierTemplateLabel" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "apiCount" INTEGER NOT NULL DEFAULT 0,
    "manualCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourierDownloadBundle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourierDownloadWorkItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "downloadBundleId" TEXT NOT NULL,
    "excloadOrderNo" TEXT NOT NULL,
    "inputSource" "CourierDownloadWorkItemSource" NOT NULL,
    "sourceMallKey" TEXT,
    "sourceMallLabel" TEXT,
    "mallOrderNo" TEXT,
    "orderSyncOrderId" TEXT,
    "matchFingerprintHmac" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourierDownloadWorkItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ShipmentUploadBatch" ADD COLUMN "downloadBundleId" TEXT;

CREATE INDEX "CourierDownloadBundle_userId_createdAt_idx" ON "CourierDownloadBundle"("userId", "createdAt");
CREATE INDEX "CourierDownloadBundle_userId_expiresAt_idx" ON "CourierDownloadBundle"("userId", "expiresAt");
CREATE INDEX "CourierDownloadBundle_expiresAt_idx" ON "CourierDownloadBundle"("expiresAt");

CREATE UNIQUE INDEX "CourierDownloadWorkItem_userId_excloadOrderNo_key" ON "CourierDownloadWorkItem"("userId", "excloadOrderNo");
CREATE INDEX "CourierDownloadWorkItem_downloadBundleId_idx" ON "CourierDownloadWorkItem"("downloadBundleId");
CREATE INDEX "CourierDownloadWorkItem_userId_expiresAt_idx" ON "CourierDownloadWorkItem"("userId", "expiresAt");
CREATE INDEX "CourierDownloadWorkItem_downloadBundleId_sourceMallKey_mallOrderNo_idx" ON "CourierDownloadWorkItem"("downloadBundleId", "sourceMallKey", "mallOrderNo");
CREATE INDEX "CourierDownloadWorkItem_orderSyncOrderId_idx" ON "CourierDownloadWorkItem"("orderSyncOrderId");
CREATE INDEX "CourierDownloadWorkItem_expiresAt_idx" ON "CourierDownloadWorkItem"("expiresAt");

CREATE INDEX "ShipmentUploadBatch_downloadBundleId_idx" ON "ShipmentUploadBatch"("downloadBundleId");

ALTER TABLE "CourierDownloadBundle" ADD CONSTRAINT "CourierDownloadBundle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourierDownloadWorkItem" ADD CONSTRAINT "CourierDownloadWorkItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourierDownloadWorkItem" ADD CONSTRAINT "CourierDownloadWorkItem_downloadBundleId_fkey" FOREIGN KEY ("downloadBundleId") REFERENCES "CourierDownloadBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourierDownloadWorkItem" ADD CONSTRAINT "CourierDownloadWorkItem_orderSyncOrderId_fkey" FOREIGN KEY ("orderSyncOrderId") REFERENCES "OrderSyncOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ShipmentUploadBatch" ADD CONSTRAINT "ShipmentUploadBatch_downloadBundleId_fkey" FOREIGN KEY ("downloadBundleId") REFERENCES "CourierDownloadBundle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
