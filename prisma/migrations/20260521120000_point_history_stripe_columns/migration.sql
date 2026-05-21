-- PointHistory Stripe 연동 컬럼 (스키마와 DB 불일치 시 조회 오류 방지)
ALTER TABLE "PointHistory" ADD COLUMN IF NOT EXISTS "stripeSessionId" TEXT;
ALTER TABLE "PointHistory" ADD COLUMN IF NOT EXISTS "stripeInvoiceId" TEXT;
