-- AlterTable
-- 도매꾹 발송정보 세금계산서 포함 여부 (0/1). 비밀정보 아님.
-- 이 마이그레이션은 이번 단계에서 DB에 적용하지 않는다.
ALTER TABLE "OrderIntegrationAccount" ADD COLUMN IF NOT EXISTS "domeggookDeliWithTax" INTEGER;
