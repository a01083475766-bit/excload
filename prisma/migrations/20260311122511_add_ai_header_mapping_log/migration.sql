-- CreateTable
CREATE TABLE "AiHeaderMappingLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originalHeader" TEXT NOT NULL,
    "aiMappedHeader" TEXT NOT NULL,
    "baseHeader" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
