-- CreateTable
CREATE TABLE "SelectionRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "grade" TEXT NOT NULL,
    "total" REAL NOT NULL,
    "rank" INTEGER,
    "metricsJson" TEXT NOT NULL,
    "formulaVersion" TEXT NOT NULL,
    "decidedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedBy" INTEGER NOT NULL,
    CONSTRAINT "SelectionRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SelectionRecord_year_idx" ON "SelectionRecord"("year");

-- CreateIndex
CREATE UNIQUE INDEX "SelectionRecord_companyId_year_key" ON "SelectionRecord"("companyId", "year");
