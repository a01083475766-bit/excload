-- AlterTable: Payment 모델에 토스페이먼츠 필드 추가
ALTER TABLE "Payment" ADD COLUMN "paymentProvider" TEXT;
ALTER TABLE "Payment" ADD COLUMN "tossPaymentKey" TEXT;
ALTER TABLE "Payment" ADD COLUMN "tossOrderId" TEXT;

-- AlterTable: Subscription 모델에 토스페이먼츠 필드 추가
ALTER TABLE "Subscription" ADD COLUMN "paymentProvider" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "tossBillingKey" TEXT;

-- 기존 Stripe 데이터 업데이트: Payment 테이블
UPDATE "Payment"
SET "paymentProvider" = 'STRIPE'
WHERE "paymentProvider" IS NULL;

-- 기존 Stripe 데이터 업데이트: Subscription 테이블
UPDATE "Subscription"
SET "paymentProvider" = 'STRIPE'
WHERE "paymentProvider" IS NULL;
