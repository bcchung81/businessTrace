-- CreateTable
CREATE TABLE "VentureCertification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyName" TEXT NOT NULL,
    "normalisedName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "validFrom" TEXT NOT NULL,
    "validUntil" TEXT NOT NULL,
    "industry" TEXT,
    "authority" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "VentureCertification_normalisedName_idx" ON "VentureCertification"("normalisedName");
