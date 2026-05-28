-- Baseline migration for fresh production databases.
-- Purpose: allow `prisma migrate deploy` to bootstrap all core tables from empty DB.

DO $$
BEGIN
  CREATE TYPE "AuthProvider" AS ENUM ('CREDENTIALS', 'GOOGLE', 'KAKAO', 'NAVER', 'UNKNOWN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "passwordHash" TEXT,
  "name" TEXT,
  "emailVerified" TIMESTAMP(3),
  "image" TEXT,
  "signupProvider" "AuthProvider" NOT NULL DEFAULT 'CREDENTIALS',
  "lastLoginProvider" "AuthProvider" NOT NULL DEFAULT 'CREDENTIALS',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "plan" TEXT NOT NULL DEFAULT 'FREE',
  "pendingPlan" TEXT,
  "pendingPlanApplyAt" TIMESTAMP(3),
  "points" INTEGER NOT NULL DEFAULT 5000,
  "nextPointDate" TIMESTAMP(3),
  "deviceId" TEXT,
  "lastIp" TEXT,
  "abuseScore" INTEGER NOT NULL DEFAULT 0,
  "abuseFlag" BOOLEAN NOT NULL DEFAULT false,
  "isBlocked" BOOLEAN NOT NULL DEFAULT false,
  "blockReason" TEXT,
  "abuseReason" TEXT,
  "stripeCustomerId" TEXT,
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "signupBonusClaimed" BOOLEAN NOT NULL DEFAULT false,
  "tossBillingKey" TEXT,
  "tossCardCompany" TEXT,
  "tossCardNumberMask" TEXT,
  "tossChargeCooldownUntil" TIMESTAMP(3),
  "subscriptionStatus" TEXT NOT NULL DEFAULT 'active',
  "paymentFailedAt" TIMESTAMP(3),
  "paymentFailureReason" TEXT,
  "paymentRetryCount" INTEGER NOT NULL DEFAULT 0,
  "gracePeriodUntil" TIMESTAMP(3),
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmailVerificationToken" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PasswordResetCode" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "purpose" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PasswordResetRequestLog" (
  "id" TEXT NOT NULL,
  "ip" TEXT NOT NULL,
  "email" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetRequestLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PasswordResetAuditLog" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "ip" TEXT,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SignupVerification" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "plan" TEXT NOT NULL DEFAULT 'FREE',
  "deviceId" TEXT,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SignupVerification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PointHistory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "change" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stripeSessionId" TEXT,
  "stripeInvoiceId" TEXT,
  CONSTRAINT "PointHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RefundRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "paymentId" TEXT,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "bankName" TEXT,
  "accountNumber" TEXT,
  "accountHolder" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ContactInquiry" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "typeLabel" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "company" TEXT,
  "phone" TEXT,
  "attachmentName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "mailSent" BOOLEAN NOT NULL DEFAULT false,
  "adminNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "ContactInquiry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Payment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'KRW',
  "stripeSessionId" TEXT,
  "stripeSubscriptionId" TEXT,
  "stripeInvoiceId" TEXT,
  "paymentProvider" TEXT,
  "tossPaymentKey" TEXT,
  "tossOrderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AiHeaderMappingLog" (
  "id" TEXT NOT NULL,
  "originalHeader" TEXT NOT NULL,
  "aiMappedHeader" TEXT NOT NULL,
  "baseHeader" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiHeaderMappingLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HeaderAlias" (
  "id" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "baseHeader" TEXT NOT NULL,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HeaderAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StripeEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Subscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stripeCustomerId" TEXT NOT NULL,
  "stripeSubscriptionId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "paymentProvider" TEXT,
  "tossBillingKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PopupCampaign" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "linkUrl" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "target" TEXT NOT NULL DEFAULT 'ALL',
  "showEveryVisit" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PopupCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TrialIpAccess" (
  "id" TEXT NOT NULL,
  "ipHash" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrialIpAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX IF NOT EXISTS "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "EmailVerificationToken_token_key" ON "EmailVerificationToken"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "SignupVerification_email_key" ON "SignupVerification"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_stripeSessionId_key" ON "Payment"("stripeSessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "HeaderAlias_alias_key" ON "HeaderAlias"("alias");
CREATE UNIQUE INDEX IF NOT EXISTS "StripeEvent_eventId_key" ON "StripeEvent"("eventId");
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");
CREATE UNIQUE INDEX IF NOT EXISTS "TrialIpAccess_ipHash_key" ON "TrialIpAccess"("ipHash");

CREATE INDEX IF NOT EXISTS "PasswordResetCode_email_idx" ON "PasswordResetCode"("email");
CREATE INDEX IF NOT EXISTS "PasswordResetCode_expiresAt_idx" ON "PasswordResetCode"("expiresAt");
CREATE INDEX IF NOT EXISTS "PasswordResetRequestLog_ip_createdAt_idx" ON "PasswordResetRequestLog"("ip", "createdAt");
CREATE INDEX IF NOT EXISTS "PasswordResetRequestLog_createdAt_idx" ON "PasswordResetRequestLog"("createdAt");
CREATE INDEX IF NOT EXISTS "PasswordResetAuditLog_email_createdAt_idx" ON "PasswordResetAuditLog"("email", "createdAt");
CREATE INDEX IF NOT EXISTS "PasswordResetAuditLog_ip_createdAt_idx" ON "PasswordResetAuditLog"("ip", "createdAt");
CREATE INDEX IF NOT EXISTS "PasswordResetAuditLog_createdAt_idx" ON "PasswordResetAuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "SignupVerification_expiresAt_idx" ON "SignupVerification"("expiresAt");
CREATE INDEX IF NOT EXISTS "ContactInquiry_createdAt_idx" ON "ContactInquiry"("createdAt");
CREATE INDEX IF NOT EXISTS "ContactInquiry_status_idx" ON "ContactInquiry"("status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PointHistory_userId_fkey'
  ) THEN
    ALTER TABLE "PointHistory"
      ADD CONSTRAINT "PointHistory_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Subscription_userId_fkey'
  ) THEN
    ALTER TABLE "Subscription"
      ADD CONSTRAINT "Subscription_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
