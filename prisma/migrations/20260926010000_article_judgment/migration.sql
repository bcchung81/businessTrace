-- CreateTable
CREATE TABLE "ArticleJudgment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "link" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "published" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "origin" TEXT NOT NULL,
    "setKey" TEXT,
    "stratum" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "modelJson" TEXT NOT NULL DEFAULT '{}',
    "entity" TEXT,
    "role" TEXT,
    "form" TEXT,
    "about" TEXT,
    "note" TEXT,
    "judgedAt" DATETIME,
    "judgedBy" INTEGER,
    "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArticleJudgment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ArticleJudgment_about_idx" ON "ArticleJudgment"("about");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleJudgment_companyId_link_key" ON "ArticleJudgment"("companyId", "link");

