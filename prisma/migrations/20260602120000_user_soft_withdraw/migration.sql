-- 탈퇴 유예(soft delete): deletedAt 시각, purgeAt 이후 영구 삭제
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "purgeAt" TIMESTAMP(3);

CREATE INDEX "User_deletedAt_purgeAt_idx" ON "User"("deletedAt", "purgeAt");
