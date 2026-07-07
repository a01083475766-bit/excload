-- CreateEnum
CREATE TYPE "OrderIntegrationProvider" AS ENUM ('COUPANG', 'ELEVEN');

-- CreateEnum
CREATE TYPE "OrderIntegrationAccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR');

-- CreateTable
CREATE TABLE "OrderIntegrationAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "OrderIntegrationProvider" NOT NULL,
    "accountName" TEXT NOT NULL,
    "vendorId" TEXT,
    "sellerId" TEXT,
    "accessKeyCiphertext" TEXT,
    "accessKeyIv" TEXT,
    "accessKeyAuthTag" TEXT,
    "secretKeyCiphertext" TEXT,
    "secretKeyIv" TEXT,
    "secretKeyAuthTag" TEXT,
    "apiKeyCiphertext" TEXT,
    "apiKeyIv" TEXT,
    "apiKeyAuthTag" TEXT,
    "encryptionKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3),
    "status" "OrderIntegrationAccountStatus" NOT NULL DEFAULT 'INACTIVE',
    "lastTestedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderIntegrationAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderIntegrationAccount_userId_provider_idx" ON "OrderIntegrationAccount"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "OrderIntegrationAccount_userId_provider_vendorId_key" ON "OrderIntegrationAccount"("userId", "provider", "vendorId");

-- AddForeignKey
ALTER TABLE "OrderIntegrationAccount" ADD CONSTRAINT "OrderIntegrationAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
