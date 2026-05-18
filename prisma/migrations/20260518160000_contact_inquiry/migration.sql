-- CreateTable
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

CREATE INDEX IF NOT EXISTS "ContactInquiry_createdAt_idx" ON "ContactInquiry"("createdAt");
CREATE INDEX IF NOT EXISTS "ContactInquiry_status_idx" ON "ContactInquiry"("status");
