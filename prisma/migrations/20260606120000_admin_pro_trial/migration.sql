-- 관리자 수동 PRO 혜택 (기간형, plan=FREE 유지)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "adminTrialEndsAt" TIMESTAMP(3);
