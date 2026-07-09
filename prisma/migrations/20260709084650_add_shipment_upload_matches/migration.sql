-- CreateEnum
CREATE TYPE "ShipmentUploadBatchStatus" AS ENUM ('UPLOADED', 'PARSED', 'MATCHED', 'PARTIALLY_CONFIRMED', 'CONFIRMED', 'READY', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShipmentAlgorithmMatchStatus" AS ENUM ('MATCHED_CONFIDENT', 'MATCHED_WARNING', 'MULTIPLE_CANDIDATES', 'NOT_MATCHED', 'DUPLICATE_TRACKING_NUMBER', 'ALREADY_SHIPPED', 'CANCELLED_OR_INVALID_ORDER');

-- CreateEnum
CREATE TYPE "ShipmentUserConfirmationStatus" AS ENUM ('UNCONFIRMED', 'CONFIRMED', 'MANUALLY_LINKED', 'EDITED', 'EXCLUDED');

-- CreateTable
CREATE TABLE "ShipmentUploadBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "OrderIntegrationProvider",
    "integrationAccountId" TEXT,
    "originalFileName" TEXT NOT NULL,
    "fileHash" TEXT,
    "fileSize" INTEGER NOT NULL,
    "fileType" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "matchedConfidentCount" INTEGER NOT NULL DEFAULT 0,
    "matchedWarningCount" INTEGER NOT NULL DEFAULT 0,
    "multipleCandidatesCount" INTEGER NOT NULL DEFAULT 0,
    "notMatchedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateTrackingNumberCount" INTEGER NOT NULL DEFAULT 0,
    "alreadyShippedCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledOrInvalidOrderCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ShipmentUploadBatchStatus" NOT NULL DEFAULT 'UPLOADED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentUploadBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentUploadRow" (
    "id" TEXT NOT NULL,
    "uploadBatchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalRowIndex" INTEGER NOT NULL,
    "rawRowJson" JSONB NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "trackingNumberNormalized" TEXT NOT NULL,
    "carrierName" TEXT,
    "carrierCode" TEXT,
    "receiverName" TEXT,
    "receiverPhone" TEXT,
    "receiverPhoneNormalized" TEXT,
    "receiverAddress" TEXT,
    "mallOrderNo" TEXT,
    "excloadOrderNo" TEXT,
    "productText" TEXT,
    "warningsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentUploadRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentMatch" (
    "id" TEXT NOT NULL,
    "uploadBatchId" TEXT NOT NULL,
    "uploadRowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderSyncOrderId" TEXT,
    "provider" "OrderIntegrationProvider",
    "integrationAccountId" TEXT,
    "algorithmMatchStatus" "ShipmentAlgorithmMatchStatus" NOT NULL,
    "userConfirmationStatus" "ShipmentUserConfirmationStatus" NOT NULL DEFAULT 'UNCONFIRMED',
    "transmissionStatus" "OrderSyncTransmissionStatus" NOT NULL DEFAULT 'NONE',
    "matchScore" INTEGER NOT NULL DEFAULT 0,
    "matchReason" TEXT,
    "mismatchFieldsJson" JSONB,
    "candidateOrdersJson" JSONB,
    "finalTrackingNumber" TEXT,
    "finalCarrierCode" TEXT,
    "finalCarrierName" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByUserId" TEXT,
    "excludedAt" TIMESTAMP(3),
    "excludeReason" TEXT,
    "transmissionErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShipmentUploadBatch_userId_createdAt_idx" ON "ShipmentUploadBatch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ShipmentUploadBatch_userId_provider_idx" ON "ShipmentUploadBatch"("userId", "provider");

-- CreateIndex
CREATE INDEX "ShipmentUploadBatch_integrationAccountId_idx" ON "ShipmentUploadBatch"("integrationAccountId");

-- CreateIndex
CREATE INDEX "ShipmentUploadRow_uploadBatchId_idx" ON "ShipmentUploadRow"("uploadBatchId");

-- CreateIndex
CREATE INDEX "ShipmentUploadRow_userId_idx" ON "ShipmentUploadRow"("userId");

-- CreateIndex
CREATE INDEX "ShipmentUploadRow_trackingNumberNormalized_idx" ON "ShipmentUploadRow"("trackingNumberNormalized");

-- CreateIndex
CREATE INDEX "ShipmentUploadRow_excloadOrderNo_idx" ON "ShipmentUploadRow"("excloadOrderNo");

-- CreateIndex
CREATE INDEX "ShipmentUploadRow_mallOrderNo_idx" ON "ShipmentUploadRow"("mallOrderNo");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentUploadRow_uploadBatchId_originalRowIndex_key" ON "ShipmentUploadRow"("uploadBatchId", "originalRowIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentMatch_uploadRowId_key" ON "ShipmentMatch"("uploadRowId");

-- CreateIndex
CREATE INDEX "ShipmentMatch_uploadBatchId_idx" ON "ShipmentMatch"("uploadBatchId");

-- CreateIndex
CREATE INDEX "ShipmentMatch_uploadRowId_idx" ON "ShipmentMatch"("uploadRowId");

-- CreateIndex
CREATE INDEX "ShipmentMatch_orderSyncOrderId_idx" ON "ShipmentMatch"("orderSyncOrderId");

-- CreateIndex
CREATE INDEX "ShipmentMatch_userId_algorithmMatchStatus_idx" ON "ShipmentMatch"("userId", "algorithmMatchStatus");

-- CreateIndex
CREATE INDEX "ShipmentMatch_userId_userConfirmationStatus_idx" ON "ShipmentMatch"("userId", "userConfirmationStatus");

-- CreateIndex
CREATE INDEX "ShipmentMatch_userId_transmissionStatus_idx" ON "ShipmentMatch"("userId", "transmissionStatus");

-- CreateIndex
CREATE INDEX "ShipmentMatch_integrationAccountId_idx" ON "ShipmentMatch"("integrationAccountId");

-- AddForeignKey
ALTER TABLE "ShipmentUploadBatch" ADD CONSTRAINT "ShipmentUploadBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentUploadBatch" ADD CONSTRAINT "ShipmentUploadBatch_integrationAccountId_fkey" FOREIGN KEY ("integrationAccountId") REFERENCES "OrderIntegrationAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentUploadRow" ADD CONSTRAINT "ShipmentUploadRow_uploadBatchId_fkey" FOREIGN KEY ("uploadBatchId") REFERENCES "ShipmentUploadBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentUploadRow" ADD CONSTRAINT "ShipmentUploadRow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentMatch" ADD CONSTRAINT "ShipmentMatch_uploadBatchId_fkey" FOREIGN KEY ("uploadBatchId") REFERENCES "ShipmentUploadBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentMatch" ADD CONSTRAINT "ShipmentMatch_uploadRowId_fkey" FOREIGN KEY ("uploadRowId") REFERENCES "ShipmentUploadRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentMatch" ADD CONSTRAINT "ShipmentMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentMatch" ADD CONSTRAINT "ShipmentMatch_orderSyncOrderId_fkey" FOREIGN KEY ("orderSyncOrderId") REFERENCES "OrderSyncOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentMatch" ADD CONSTRAINT "ShipmentMatch_integrationAccountId_fkey" FOREIGN KEY ("integrationAccountId") REFERENCES "OrderIntegrationAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
