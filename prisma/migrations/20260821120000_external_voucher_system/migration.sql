-- External voucher system (additive). Does not alter User.plan / Payment / Subscription.

CREATE TABLE "VoucherCampaign" (
    "id" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "campaignCode" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "projectEndsAt" TIMESTAMP(3),
    "fulfillmentFrom" TIMESTAMP(3),
    "fulfillmentTo" TIMESTAMP(3),
    "redeemFrom" TIMESTAMP(3),
    "redeemUntil" TIMESTAMP(3),
    "serviceGaAt" TIMESTAMP(3),
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoucherCampaign_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VoucherCampaign_campaignCode_key" ON "VoucherCampaign"("campaignCode");
CREATE UNIQUE INDEX "VoucherCampaign_slug_key" ON "VoucherCampaign"("slug");
CREATE INDEX "VoucherCampaign_providerCode_status_idx" ON "VoucherCampaign"("providerCode", "status");

CREATE TABLE "RewardPolicy" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "rewardCode" TEXT NOT NULL,
    "accessTier" TEXT NOT NULL DEFAULT 'PRO',
    "durationMonths" INTEGER NOT NULL,
    "grantsProAccess" BOOLEAN NOT NULL DEFAULT true,
    "pointsMode" TEXT NOT NULL DEFAULT 'NONE',
    "soldPriceKrw" INTEGER,
    "startPolicy" TEXT NOT NULL DEFAULT 'ON_REDEEM_OR_GA',
    "stackPolicy" TEXT NOT NULL DEFAULT 'SEQUENTIAL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RewardPolicy_campaignId_rewardCode_key" ON "RewardPolicy"("campaignId", "rewardCode");
CREATE INDEX "RewardPolicy_campaignId_status_idx" ON "RewardPolicy"("campaignId", "status");

CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "rewardPolicyId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeLast4" TEXT NOT NULL,
    "codeVersion" INTEGER NOT NULL DEFAULT 1,
    "externalOrderId" TEXT NOT NULL,
    "unitIndex" INTEGER NOT NULL DEFAULT 0,
    "externalRewardName" TEXT,
    "purchaseAmount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "redeemedByUserId" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "accessTierSnapshot" TEXT NOT NULL,
    "durationMonthsSnapshot" INTEGER NOT NULL,
    "pointsModeSnapshot" TEXT NOT NULL,
    "startPolicySnapshot" TEXT NOT NULL,
    "stackPolicySnapshot" TEXT NOT NULL,
    "grantsProAccessSnapshot" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Voucher_codeHash_key" ON "Voucher"("codeHash");
CREATE UNIQUE INDEX "Voucher_campaignId_externalOrderId_unitIndex_key" ON "Voucher"("campaignId", "externalOrderId", "unitIndex");
CREATE INDEX "Voucher_status_campaignId_idx" ON "Voucher"("status", "campaignId");
CREATE INDEX "Voucher_redeemedByUserId_idx" ON "Voucher"("redeemedByUserId");

CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PRO',
    "source" TEXT NOT NULL,
    "sourceRefId" TEXT NOT NULL,
    "lifecycleStatus" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "durationMonths" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Entitlement_source_sourceRefId_key" ON "Entitlement"("source", "sourceRefId");
CREATE INDEX "Entitlement_userId_lifecycleStatus_idx" ON "Entitlement"("userId", "lifecycleStatus");
CREATE INDEX "Entitlement_userId_startsAt_endsAt_idx" ON "Entitlement"("userId", "startsAt", "endsAt");

CREATE TABLE "VoucherAuditLog" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT,
    "userId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "reason" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoucherAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoucherAuditLog_voucherId_createdAt_idx" ON "VoucherAuditLog"("voucherId", "createdAt");
CREATE INDEX "VoucherAuditLog_userId_createdAt_idx" ON "VoucherAuditLog"("userId", "createdAt");
CREATE INDEX "VoucherAuditLog_action_createdAt_idx" ON "VoucherAuditLog"("action", "createdAt");

ALTER TABLE "RewardPolicy" ADD CONSTRAINT "RewardPolicy_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "VoucherCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "VoucherCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_rewardPolicyId_fkey" FOREIGN KEY ("rewardPolicyId") REFERENCES "RewardPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_redeemedByUserId_fkey" FOREIGN KEY ("redeemedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoucherAuditLog" ADD CONSTRAINT "VoucherAuditLog_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VoucherAuditLog" ADD CONSTRAINT "VoucherAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Idempotent seed: WADIZ_2026_01 campaign + rewards (no voucher codes)
INSERT INTO "VoucherCampaign" (
  "id", "providerCode", "campaignCode", "slug", "status",
  "projectEndsAt", "fulfillmentFrom", "fulfillmentTo",
  "redeemFrom", "redeemUntil", "serviceGaAt", "title",
  "createdAt", "updatedAt"
)
VALUES (
  'seed_wadiz_2026_01_campaign',
  'WADIZ',
  'WADIZ_2026_01',
  'wadiz-2026-01',
  'ACTIVE',
  '2026-09-24T14:59:59.999Z',
  '2026-09-30T15:00:00.000Z',
  '2026-10-10T14:59:59.999Z',
  '2026-09-30T15:00:00.000Z',
  NULL,
  '2026-09-30T15:00:00.000Z',
  '와디즈 2026 1차',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("campaignCode") DO NOTHING;

INSERT INTO "RewardPolicy" (
  "id", "campaignId", "rewardCode", "accessTier", "durationMonths",
  "grantsProAccess", "pointsMode", "soldPriceKrw",
  "startPolicy", "stackPolicy", "status", "createdAt", "updatedAt"
)
VALUES
  ('seed_wadiz_2026_01_r_3m', 'seed_wadiz_2026_01_campaign', 'SUPER_EARLY_3M', 'PRO', 3, true, 'NONE', 8800, 'ON_REDEEM_OR_GA', 'SEQUENTIAL', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_wadiz_2026_01_r_6m', 'seed_wadiz_2026_01_campaign', 'SUPER_EARLY_6M', 'PRO', 6, true, 'NONE', 16500, 'ON_REDEEM_OR_GA', 'SEQUENTIAL', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_wadiz_2026_01_r_12m', 'seed_wadiz_2026_01_campaign', 'SUPER_EARLY_12M', 'PRO', 12, true, 'NONE', 27500, 'ON_REDEEM_OR_GA', 'SEQUENTIAL', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_wadiz_2026_01_r_sp12', 'seed_wadiz_2026_01_campaign', 'WADIZ_SPECIAL_12M', 'PRO', 12, true, 'NONE', 33000, 'ON_REDEEM_OR_GA', 'SEQUENTIAL', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("campaignId", "rewardCode") DO NOTHING;
