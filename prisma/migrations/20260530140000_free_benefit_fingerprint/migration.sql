-- CreateTable
CREATE TABLE "FreeBenefitFingerprint" (
    "type" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "signupBonusUsed" BOOLEAN NOT NULL DEFAULT false,
    "blockedAfterWithdraw" BOOLEAN NOT NULL DEFAULT false,
    "firstClaimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastWithdrawnAt" TIMESTAMP(3),
    "withdrawCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FreeBenefitFingerprint_pkey" PRIMARY KEY ("type","hash")
);

-- CreateIndex
CREATE INDEX "FreeBenefitFingerprint_blockedAfterWithdraw_idx" ON "FreeBenefitFingerprint"("blockedAfterWithdraw");
