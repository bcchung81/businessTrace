-- CreateTable
CREATE TABLE "Event" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "evidenceKey" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "runId" INTEGER,
    "trust" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "note" TEXT,
    "reviewedAt" DATETIME,
    "reviewedBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Event_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalysisRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Event_occurredAt_idx" ON "Event"("occurredAt");

-- CreateIndex
CREATE INDEX "Event_companyId_status_idx" ON "Event"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Event_companyId_kind_evidenceKey_key" ON "Event"("companyId", "kind", "evidenceKey");
