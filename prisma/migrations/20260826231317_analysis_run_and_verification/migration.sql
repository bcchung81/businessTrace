-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "periodStart" DATETIME,
    "periodEnd" DATETIME,
    "formulaVersion" TEXT NOT NULL DEFAULT 'v2-anthropic',
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "newsJson" TEXT NOT NULL,
    "resultJson" TEXT,
    "usageJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "AnalysisRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AnalysisRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationResult" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "analysisRunId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "faithfulness" REAL,
    "sourceCoverage" REAL,
    "evidenceMatch" REAL,
    "unsupportedClaims" TEXT NOT NULL,
    "counterEvidence" TEXT NOT NULL,
    "detailJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AnalysisRun_companyId_createdAt_idx" ON "AnalysisRun"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationResult_analysisRunId_key" ON "VerificationResult"("analysisRunId");
