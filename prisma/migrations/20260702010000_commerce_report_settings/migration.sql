-- 커머스 리포트/뉴스레터 — 관리 키워드 · 설정 (Phase B: 화면 목업 이후 DB 연동)
CREATE TABLE IF NOT EXISTS "CommerceKeyword" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommerceKeyword_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CommerceKeyword_keyword_key" ON "CommerceKeyword"("keyword");
CREATE INDEX IF NOT EXISTS "CommerceKeyword_isActive_sortOrder_idx" ON "CommerceKeyword"("isActive", "sortOrder");

CREATE TABLE IF NOT EXISTS "CommerceReportSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "bannedWords" JSONB NOT NULL,
    "adPhrase" TEXT NOT NULL DEFAULT '',
    "toneStyle" TEXT NOT NULL DEFAULT 'PLAIN',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommerceReportSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CommerceReportSettings" ("id", "bannedWords", "adPhrase", "toneStyle", "updatedAt")
VALUES ('default', '[]'::jsonb, '', 'PLAIN', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
