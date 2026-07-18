ALTER TABLE "OrderIntegrationAccount"
  ADD COLUMN "healthOperationSequence" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "healthAppliedOperationSequence" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "healthCheckLeaseToken" TEXT,
  ADD COLUMN "healthCheckLeaseUntil" TIMESTAMP(3);
