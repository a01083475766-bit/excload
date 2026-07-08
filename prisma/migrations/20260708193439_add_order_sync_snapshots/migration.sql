-- CreateEnum
CREATE TYPE "OrderSyncBatchSourceType" AS ENUM ('API', 'EXCEL', 'MANUAL');

-- CreateEnum
CREATE TYPE "OrderSyncBatchStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'ERROR');

-- CreateEnum
CREATE TYPE "OrderSyncTransmissionStatus" AS ENUM ('NONE', 'READY', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "OrderSyncBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "OrderIntegrationProvider" NOT NULL,
    "integrationAccountId" TEXT,
    "sourceType" "OrderSyncBatchSourceType" NOT NULL DEFAULT 'API',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "status" "OrderSyncBatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "memo" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderSyncBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSyncOrder" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "OrderIntegrationProvider" NOT NULL,
    "integrationAccountId" TEXT,
    "excloadOrderNo" TEXT NOT NULL,
    "mallOrderNo" TEXT NOT NULL,
    "mallOrderId" TEXT,
    "mallLineItemIds" JSONB,
    "receiverName" TEXT,
    "receiverPhone" TEXT,
    "receiverAddress" TEXT,
    "productSummary" TEXT,
    "quantity" INTEGER,
    "deliveryMemo" TEXT,
    "orderedAt" TIMESTAMP(3),
    "orderStatus" TEXT,
    "rawPayloadJson" JSONB,
    "normalizedPayloadJson" JSONB,
    "trackingNumber" TEXT,
    "carrierCode" TEXT,
    "shippedAt" TIMESTAMP(3),
    "transmissionStatus" "OrderSyncTransmissionStatus" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderSyncOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExcloadOrderNoSequence" (
    "id" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExcloadOrderNoSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderSyncBatch_userId_provider_idx" ON "OrderSyncBatch"("userId", "provider");

-- CreateIndex
CREATE INDEX "OrderSyncBatch_integrationAccountId_idx" ON "OrderSyncBatch"("integrationAccountId");

-- CreateIndex
CREATE INDEX "OrderSyncBatch_fetchedAt_idx" ON "OrderSyncBatch"("fetchedAt");

-- CreateIndex
CREATE INDEX "OrderSyncOrder_userId_provider_idx" ON "OrderSyncOrder"("userId", "provider");

-- CreateIndex
CREATE INDEX "OrderSyncOrder_userId_provider_mallOrderNo_idx" ON "OrderSyncOrder"("userId", "provider", "mallOrderNo");

-- CreateIndex
CREATE INDEX "OrderSyncOrder_batchId_idx" ON "OrderSyncOrder"("batchId");

-- CreateIndex
CREATE INDEX "OrderSyncOrder_integrationAccountId_idx" ON "OrderSyncOrder"("integrationAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderSyncOrder_userId_excloadOrderNo_key" ON "OrderSyncOrder"("userId", "excloadOrderNo");

-- CreateIndex
CREATE UNIQUE INDEX "ExcloadOrderNoSequence_dateKey_key" ON "ExcloadOrderNoSequence"("dateKey");

-- AddForeignKey
ALTER TABLE "OrderSyncBatch" ADD CONSTRAINT "OrderSyncBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSyncBatch" ADD CONSTRAINT "OrderSyncBatch_integrationAccountId_fkey" FOREIGN KEY ("integrationAccountId") REFERENCES "OrderIntegrationAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSyncOrder" ADD CONSTRAINT "OrderSyncOrder_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "OrderSyncBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSyncOrder" ADD CONSTRAINT "OrderSyncOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSyncOrder" ADD CONSTRAINT "OrderSyncOrder_integrationAccountId_fkey" FOREIGN KEY ("integrationAccountId") REFERENCES "OrderIntegrationAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
