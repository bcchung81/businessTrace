-- CreateTable
CREATE TABLE "PensionSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "ym" TEXT NOT NULL,
    "subscribers" INTEGER,
    "noticeAmount" INTEGER,
    "hired" INTEGER,
    "departed" INTEGER,
    "workplaceCount" INTEGER NOT NULL DEFAULT 1,
    "businessNoPrefix" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PensionSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PensionSnapshot_companyId_ym_idx" ON "PensionSnapshot"("companyId", "ym");

-- CreateIndex
CREATE UNIQUE INDEX "PensionSnapshot_companyId_ym_key" ON "PensionSnapshot"("companyId", "ym");
