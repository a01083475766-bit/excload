-- CreateTable
CREATE TABLE "RefundRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "paymentId" TEXT,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "bankName" TEXT,
  "accountNumber" TEXT,
  "accountHolder" TEXT,
  "reason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" DATETIME
);
