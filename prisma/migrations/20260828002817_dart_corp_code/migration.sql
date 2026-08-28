-- CreateTable
CREATE TABLE "DartCorpCode" (
    "corpCode" TEXT NOT NULL PRIMARY KEY,
    "corpName" TEXT NOT NULL,
    "stockCode" TEXT,
    "modifyDate" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "DartCorpCode_corpName_idx" ON "DartCorpCode"("corpName");
