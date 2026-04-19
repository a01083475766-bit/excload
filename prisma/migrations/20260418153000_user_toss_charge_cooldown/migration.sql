-- 토스 결제 동시 요청·연타 방지용 (서버 단)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tossChargeCooldownUntil" TIMESTAMP(3);
