-- 오픈 피드백 이벤트
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "feedbackTrialEndsAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "feedbackTrialUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "feedbackPopupSeenAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "FeedbackEventSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeedbackEventSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FeedbackSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "featureUsed" TEXT NOT NULL,
    "conversionResult" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "publicConsent" BOOLEAN NOT NULL DEFAULT false,
    "attachmentName" TEXT,
    "attachmentUrl" TEXT,
    "trialGranted" BOOLEAN NOT NULL DEFAULT false,
    "systemReply" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FeedbackSubmission_userId_createdAt_idx" ON "FeedbackSubmission"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "FeedbackSubmission_publicConsent_createdAt_idx" ON "FeedbackSubmission"("publicConsent", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FeedbackSubmission_userId_fkey'
  ) THEN
    ALTER TABLE "FeedbackSubmission" ADD CONSTRAINT "FeedbackSubmission_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "FeedbackEventSettings" ("id", "endsAt", "isEnabled", "updatedAt")
VALUES ('default', '2026-07-30 14:59:59.999'::timestamp, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
