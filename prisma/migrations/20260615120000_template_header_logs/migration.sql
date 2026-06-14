-- CreateTable
CREATE TABLE IF NOT EXISTS "TemplateHeaderLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "fileSessionId" TEXT,
    "templateId" TEXT,
    "page" TEXT NOT NULL,
    "templateName" TEXT,
    "courierName" TEXT,
    "headers" JSONB NOT NULL,
    "mappedHeaders" JSONB NOT NULL,
    "unknownHeaders" JSONB NOT NULL,
    "headerCount" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'template_upload',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateHeaderLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TemplateHeaderLog_createdAt_idx" ON "TemplateHeaderLog"("createdAt");
CREATE INDEX IF NOT EXISTS "TemplateHeaderLog_page_idx" ON "TemplateHeaderLog"("page");
CREATE INDEX IF NOT EXISTS "TemplateHeaderLog_courierName_idx" ON "TemplateHeaderLog"("courierName");
CREATE INDEX IF NOT EXISTS "TemplateHeaderLog_userId_idx" ON "TemplateHeaderLog"("userId");

ALTER TABLE "TemplateHeaderLog" DROP CONSTRAINT IF EXISTS "TemplateHeaderLog_userId_fkey";
ALTER TABLE "TemplateHeaderLog" ADD CONSTRAINT "TemplateHeaderLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
