-- CreateTable
CREATE TABLE "FreeToolDownloadStat" (
    "id" TEXT NOT NULL,
    "toolKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreeToolDownloadStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FreeToolDownloadStat_toolKey_key" ON "FreeToolDownloadStat"("toolKey");
