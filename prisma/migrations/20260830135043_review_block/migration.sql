-- AlterTable
ALTER TABLE "Company" ADD COLUMN "aliases" TEXT;

-- AlterTable
ALTER TABLE "VerificationResult" ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "VerificationResult" ADD COLUMN "reviewedAt" DATETIME;
ALTER TABLE "VerificationResult" ADD COLUMN "reviewedBy" INTEGER;

-- CreateTable
CREATE TABLE "SourceDecision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT,
    "decidedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedBy" INTEGER NOT NULL,
    CONSTRAINT "SourceDecision_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceDecision_companyId_source_key" ON "SourceDecision"("companyId", "source");
