-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PopupCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "target" TEXT NOT NULL DEFAULT 'ALL',
    "showEveryVisit" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PopupCampaign" ("createdAt", "endAt", "id", "imageUrl", "isActive", "linkUrl", "priority", "startAt", "title", "updatedAt") SELECT "createdAt", "endAt", "id", "imageUrl", "isActive", "linkUrl", "priority", "startAt", "title", "updatedAt" FROM "PopupCampaign";
DROP TABLE "PopupCampaign";
ALTER TABLE "new_PopupCampaign" RENAME TO "PopupCampaign";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
