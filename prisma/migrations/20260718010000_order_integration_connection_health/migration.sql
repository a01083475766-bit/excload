-- AlterTable: 연결 상태(Connection Health) 공통 필드 추가 (모두 nullable 또는 안전한 기본값, 기존 데이터 무손상)
ALTER TABLE "OrderIntegrationAccount"
  ADD COLUMN "healthStatus" TEXT,
  ADD COLUMN "lastCheckedAt" TIMESTAMP(3),
  ADD COLUMN "lastSuccessAt" TIMESTAMP(3),
  ADD COLUMN "lastFailureAt" TIMESTAMP(3),
  ADD COLUMN "lastErrorCategory" TEXT,
  ADD COLUMN "lastErrorCode" TEXT,
  ADD COLUMN "consecutiveFailureCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "authorizationPeriodStart" DATE,
  ADD COLUMN "authorizationPeriodEnd" DATE;
