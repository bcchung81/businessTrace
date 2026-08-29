-- CreateTable
CREATE TABLE "SourceSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT,
    "payload" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourceSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SourceSnapshot_companyId_idx" ON "SourceSnapshot"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceSnapshot_companyId_source_key" ON "SourceSnapshot"("companyId", "source");
