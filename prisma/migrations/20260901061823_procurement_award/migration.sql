-- CreateTable
CREATE TABLE "ProcurementAward" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "awardKey" TEXT NOT NULL,
    "bidNoticeNo" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "agency" TEXT,
    "amount" INTEGER,
    "awardedAt" TEXT,
    "matchedBy" TEXT NOT NULL,
    "winnerName" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcurementAward_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProcurementAward_companyId_awardedAt_idx" ON "ProcurementAward"("companyId", "awardedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementAward_companyId_awardKey_key" ON "ProcurementAward"("companyId", "awardKey");
