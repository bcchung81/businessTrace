-- CreateTable
CREATE TABLE "CompanyGeocode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "precision" TEXT NOT NULL,
    "roadAddress" TEXT,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyGeocode_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyGeocode_companyId_key" ON "CompanyGeocode"("companyId");
