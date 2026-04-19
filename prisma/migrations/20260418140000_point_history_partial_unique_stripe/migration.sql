-- Stripe checkout/invoice 동시 처리 등으로 인한 중복 포인트 이력 방지 (NULL 행은 제외)
CREATE UNIQUE INDEX IF NOT EXISTS "PointHistory_userId_stripeSessionId_partial_key"
ON "PointHistory" ("userId", "stripeSessionId")
WHERE "stripeSessionId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "PointHistory_userId_stripeInvoiceId_partial_key"
ON "PointHistory" ("userId", "stripeInvoiceId")
WHERE "stripeInvoiceId" IS NOT NULL;
