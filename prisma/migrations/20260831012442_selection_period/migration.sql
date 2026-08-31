-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SelectionRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "period" TEXT NOT NULL DEFAULT '',
    "grade" TEXT NOT NULL,
    "total" REAL NOT NULL,
    "rank" INTEGER,
    "metricsJson" TEXT NOT NULL,
    "formulaVersion" TEXT NOT NULL,
    "decidedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedBy" INTEGER NOT NULL,
    CONSTRAINT "SelectionRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SelectionRecord" ("companyId", "decidedAt", "decidedBy", "formulaVersion", "grade", "id", "metricsJson", "rank", "total", "year") SELECT "companyId", "decidedAt", "decidedBy", "formulaVersion", "grade", "id", "metricsJson", "rank", "total", "year" FROM "SelectionRecord";
DROP TABLE "SelectionRecord";
ALTER TABLE "new_SelectionRecord" RENAME TO "SelectionRecord";
CREATE INDEX "SelectionRecord_year_idx" ON "SelectionRecord"("year");
CREATE UNIQUE INDEX "SelectionRecord_companyId_period_key" ON "SelectionRecord"("companyId", "period");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

UPDATE "SelectionRecord" SET "period" = CAST("year" AS TEXT) WHERE "period" = '';
