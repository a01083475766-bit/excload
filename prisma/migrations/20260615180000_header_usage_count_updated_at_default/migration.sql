-- HeaderUsageCount.updatedAt: NOT NULL without DEFAULT → Prisma @updatedAt 외 삽입 시 실패 방지
ALTER TABLE "HeaderUsageCount" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
