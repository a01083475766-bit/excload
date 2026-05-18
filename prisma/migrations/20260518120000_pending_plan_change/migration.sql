-- AlterTable (IF NOT EXISTS: 수동 적용·재실행 시에도 안전)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingPlan" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingPlanApplyAt" TIMESTAMP(3);
