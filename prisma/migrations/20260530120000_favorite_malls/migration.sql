-- CreateTable
CREATE TABLE "UserFavoriteMall" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFavoriteMall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FavoriteMallUrlStat" (
    "id" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "registerCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueUserCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FavoriteMallUrlStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFavoriteMallUrlSeen" (
    "userId" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFavoriteMallUrlSeen_pkey" PRIMARY KEY ("userId","normalizedUrl")
);

-- CreateIndex
CREATE INDEX "UserFavoriteMall_userId_sortOrder_idx" ON "UserFavoriteMall"("userId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteMallUrlStat_normalizedUrl_key" ON "FavoriteMallUrlStat"("normalizedUrl");

-- CreateIndex
CREATE INDEX "FavoriteMallUrlStat_uniqueUserCount_idx" ON "FavoriteMallUrlStat"("uniqueUserCount");

-- AddForeignKey
ALTER TABLE "UserFavoriteMall" ADD CONSTRAINT "UserFavoriteMall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
