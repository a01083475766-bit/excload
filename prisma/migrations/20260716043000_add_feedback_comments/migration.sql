-- CreateTable
CREATE TABLE "FeedbackComment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isAdminComment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedbackComment_submissionId_createdAt_idx" ON "FeedbackComment"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedbackComment_submissionId_isAdminComment_createdAt_idx" ON "FeedbackComment"("submissionId", "isAdminComment", "createdAt");

-- CreateIndex
CREATE INDEX "FeedbackComment_userId_createdAt_idx" ON "FeedbackComment"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "FeedbackComment" ADD CONSTRAINT "FeedbackComment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FeedbackSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackComment" ADD CONSTRAINT "FeedbackComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
