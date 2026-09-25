-- CreateTable
CREATE TABLE "JobLock" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "holder" TEXT NOT NULL,
    "acquiredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);
