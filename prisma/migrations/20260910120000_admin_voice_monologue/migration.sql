-- CreateEnum
CREATE TYPE "VoiceGenerationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "VoiceProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "referenceStoragePath" TEXT NOT NULL,
    "referenceOriginalName" TEXT NOT NULL,
    "referenceMimeType" TEXT NOT NULL,
    "referenceDurationSeconds" DOUBLE PRECISION,
    "referenceSizeBytes" INTEGER,
    "promptText" TEXT NOT NULL,
    "defaultInstruction" TEXT,
    "defaultSpeed" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceGeneration" (
    "id" TEXT NOT NULL,
    "voiceProfileId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "instruction" TEXT,
    "speed" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "outputStoragePath" TEXT,
    "status" "VoiceGenerationStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceProfile_createdAt_idx" ON "VoiceProfile"("createdAt");

-- CreateIndex
CREATE INDEX "VoiceGeneration_voiceProfileId_createdAt_idx" ON "VoiceGeneration"("voiceProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "VoiceGeneration_status_createdAt_idx" ON "VoiceGeneration"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "VoiceGeneration" ADD CONSTRAINT "VoiceGeneration_voiceProfileId_fkey" FOREIGN KEY ("voiceProfileId") REFERENCES "VoiceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
