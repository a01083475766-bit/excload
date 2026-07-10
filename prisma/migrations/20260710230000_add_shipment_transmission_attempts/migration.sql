-- AlterEnum: OrderSyncTransmissionStatus
-- 목표 순서: NONE, READY, PROCESSING, SENT, FAILED, SKIPPED, UNKNOWN
-- (단순 ADD VALUE는 맨 뒤에만 붙으므로 BEFORE/AFTER 사용 — PostgreSQL 10+)
ALTER TYPE "OrderSyncTransmissionStatus" ADD VALUE 'PROCESSING' BEFORE 'SENT';
ALTER TYPE "OrderSyncTransmissionStatus" ADD VALUE 'UNKNOWN' AFTER 'SKIPPED';

-- CreateEnum
CREATE TYPE "ShipmentTransmissionAttemptStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'UNKNOWN', 'CANCELLED');

-- AlterTable: ShipmentMatch lease fields (기존 transmissionStatus 값은 변경하지 않음)
ALTER TABLE "ShipmentMatch" ADD COLUMN     "transmissionLeaseToken" VARCHAR(64),
ADD COLUMN     "transmissionLeaseExpiresAt" TIMESTAMP(3),
ADD COLUMN     "lastTransmissionAttemptAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ShipmentTransmissionAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shipmentMatchId" TEXT NOT NULL,
    "orderSyncOrderId" TEXT,
    "uploadBatchId" TEXT NOT NULL,
    "provider" "OrderIntegrationProvider" NOT NULL,
    "integrationAccountId" TEXT,
    "mallOrderNo" TEXT NOT NULL,
    "excloadOrderNo" TEXT NOT NULL,
    "mallLineItemIdsJson" JSONB,
    "trackingNumberNormalized" TEXT NOT NULL,
    "courierCode" TEXT,
    "courierName" TEXT,
    "payloadFingerprint" VARCHAR(64) NOT NULL,
    "fingerprintVersion" INTEGER NOT NULL DEFAULT 1,
    "attemptNo" INTEGER NOT NULL,
    "status" "ShipmentTransmissionAttemptStatus" NOT NULL,
    "providerRequestId" TEXT,
    "responseSummaryJson" JSONB,
    "errorCode" TEXT,
    "errorMessage" VARCHAR(500),
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "executionToken" VARCHAR(64) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentTransmissionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShipmentMatch_transmissionStatus_transmissionLeaseExpiresAt_idx" ON "ShipmentMatch"("transmissionStatus", "transmissionLeaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentTransmissionAttempt_shipmentMatchId_attemptNo_key" ON "ShipmentTransmissionAttempt"("shipmentMatchId", "attemptNo");

-- CreateIndex
CREATE INDEX "ShipmentTransmissionAttempt_shipmentMatchId_createdAt_idx" ON "ShipmentTransmissionAttempt"("shipmentMatchId", "createdAt");

-- CreateIndex
CREATE INDEX "ShipmentTransmissionAttempt_userId_provider_createdAt_idx" ON "ShipmentTransmissionAttempt"("userId", "provider", "createdAt");

-- CreateIndex
CREATE INDEX "ShipmentTransmissionAttempt_payloadFingerprint_idx" ON "ShipmentTransmissionAttempt"("payloadFingerprint");

-- CreateIndex
CREATE INDEX "ShipmentTransmissionAttempt_providerRequestId_idx" ON "ShipmentTransmissionAttempt"("providerRequestId");

-- CreateIndex
CREATE INDEX "ShipmentTransmissionAttempt_status_startedAt_idx" ON "ShipmentTransmissionAttempt"("status", "startedAt");

-- CreateIndex
CREATE INDEX "ShipmentTransmissionAttempt_uploadBatchId_idx" ON "ShipmentTransmissionAttempt"("uploadBatchId");

-- CreateIndex
CREATE INDEX "ShipmentTransmissionAttempt_integrationAccountId_idx" ON "ShipmentTransmissionAttempt"("integrationAccountId");

-- CreateIndex
CREATE INDEX "ShipmentTransmissionAttempt_orderSyncOrderId_idx" ON "ShipmentTransmissionAttempt"("orderSyncOrderId");

-- AddForeignKey
ALTER TABLE "ShipmentTransmissionAttempt" ADD CONSTRAINT "ShipmentTransmissionAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentTransmissionAttempt" ADD CONSTRAINT "ShipmentTransmissionAttempt_shipmentMatchId_fkey" FOREIGN KEY ("shipmentMatchId") REFERENCES "ShipmentMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentTransmissionAttempt" ADD CONSTRAINT "ShipmentTransmissionAttempt_orderSyncOrderId_fkey" FOREIGN KEY ("orderSyncOrderId") REFERENCES "OrderSyncOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentTransmissionAttempt" ADD CONSTRAINT "ShipmentTransmissionAttempt_integrationAccountId_fkey" FOREIGN KEY ("integrationAccountId") REFERENCES "OrderIntegrationAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
