-- CreateTable
CREATE TABLE "PopupCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT,
    "emailVerified" DATETIME,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "points" INTEGER NOT NULL DEFAULT 5000,
    "nextPointDate" DATETIME,
    "deviceId" TEXT,
    "lastIp" TEXT,
    "abuseScore" INTEGER NOT NULL DEFAULT 0,
    "abuseFlag" BOOLEAN NOT NULL DEFAULT false,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockReason" TEXT,
    "abuseReason" TEXT,
    "stripeCustomerId" TEXT,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "signupBonusClaimed" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_User" ("cancelAtPeriodEnd", "createdAt", "deviceId", "email", "emailVerified", "id", "image", "name", "nextPointDate", "passwordHash", "plan", "points", "signupBonusClaimed", "stripeCustomerId", "updatedAt") SELECT "cancelAtPeriodEnd", "createdAt", "deviceId", "email", "emailVerified", "id", "image", "name", "nextPointDate", "passwordHash", "plan", "points", "signupBonusClaimed", "stripeCustomerId", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
