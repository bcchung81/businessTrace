-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AnalysisRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "periodStart" DATETIME,
    "periodEnd" DATETIME,
    "formulaVersion" TEXT NOT NULL DEFAULT 'v2-anthropic',
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "newsJson" TEXT NOT NULL,
    "duplicatesRemoved" INTEGER NOT NULL DEFAULT 0,
    "resultJson" TEXT,
    "usageJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "AnalysisRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AnalysisRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AnalysisRun" ("companyId", "completedAt", "createdAt", "formulaVersion", "id", "model", "newsJson", "periodEnd", "periodStart", "resultJson", "status", "usageJson", "userId") SELECT "companyId", "completedAt", "createdAt", "formulaVersion", "id", "model", "newsJson", "periodEnd", "periodStart", "resultJson", "status", "usageJson", "userId" FROM "AnalysisRun";
DROP TABLE "AnalysisRun";
ALTER TABLE "new_AnalysisRun" RENAME TO "AnalysisRun";
CREATE INDEX "AnalysisRun_companyId_createdAt_idx" ON "AnalysisRun"("companyId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
