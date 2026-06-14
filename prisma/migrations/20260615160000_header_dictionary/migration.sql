-- CreateTable
CREATE TABLE IF NOT EXISTS "HeaderDictionary" (
    "id" TEXT NOT NULL,
    "header" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "page" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "exampleBaseHeader" TEXT,

    CONSTRAINT "HeaderDictionary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "HeaderUsageCount" (
    "id" TEXT NOT NULL,
    "headerDictionaryId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeaderUsageCount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HeaderDictionary_header_key" ON "HeaderDictionary"("header");
CREATE INDEX IF NOT EXISTS "HeaderDictionary_firstSeenAt_idx" ON "HeaderDictionary"("firstSeenAt");
CREATE INDEX IF NOT EXISTS "HeaderDictionary_page_idx" ON "HeaderDictionary"("page");
CREATE INDEX IF NOT EXISTS "HeaderDictionary_source_idx" ON "HeaderDictionary"("source");

CREATE UNIQUE INDEX IF NOT EXISTS "HeaderUsageCount_headerDictionaryId_key" ON "HeaderUsageCount"("headerDictionaryId");
CREATE INDEX IF NOT EXISTS "HeaderUsageCount_count_idx" ON "HeaderUsageCount"("count");
CREATE INDEX IF NOT EXISTS "HeaderUsageCount_lastSeenAt_idx" ON "HeaderUsageCount"("lastSeenAt");

ALTER TABLE "HeaderUsageCount" DROP CONSTRAINT IF EXISTS "HeaderUsageCount_headerDictionaryId_fkey";
ALTER TABLE "HeaderUsageCount" ADD CONSTRAINT "HeaderUsageCount_headerDictionaryId_fkey" FOREIGN KEY ("headerDictionaryId") REFERENCES "HeaderDictionary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
