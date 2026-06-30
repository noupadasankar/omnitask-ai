-- CreateEnum
CREATE TYPE "JobApplicationStatus" AS ENUM ('MATCHED', 'SKIPPED', 'PENDING_APPROVAL', 'APPLIED', 'FAILED');

-- CreateTable
CREATE TABLE "JobPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "locations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minScore" INTEGER NOT NULL DEFAULT 60,
    "dailyLimit" INTEGER NOT NULL DEFAULT 20,
    "remoteOnly" BOOLEAN NOT NULL DEFAULT false,
    "minSalary" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portal" TEXT NOT NULL,
    "externalJobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "location" TEXT,
    "url" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "matchReasons" JSONB,
    "status" "JobApplicationStatus" NOT NULL DEFAULT 'MATCHED',
    "sessionId" TEXT,
    "errorMessage" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobPreference_userId_key" ON "JobPreference"("userId");

-- CreateIndex
CREATE INDEX "JobPreference_userId_idx" ON "JobPreference"("userId");

-- CreateIndex
CREATE INDEX "JobApplication_userId_idx" ON "JobApplication"("userId");

-- CreateIndex
CREATE INDEX "JobApplication_status_idx" ON "JobApplication"("status");

-- CreateIndex
CREATE INDEX "JobApplication_sessionId_idx" ON "JobApplication"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "JobApplication_userId_portal_externalJobId_key" ON "JobApplication"("userId", "portal", "externalJobId");
