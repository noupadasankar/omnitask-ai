-- CreateEnum
CREATE TYPE "TrajectoryGrade" AS ENUM ('UNGRADED', 'GOLD', 'DEMONSTRATION', 'REJECTED');

-- CreateTable
CREATE TABLE "TrajectoryStep" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "stepIndex" INTEGER NOT NULL,
    "goal" TEXT,
    "domain" TEXT,
    "url" TEXT,
    "observation" TEXT,
    "prompt" JSONB,
    "decision" JSONB,
    "tool" TEXT,
    "actionResult" TEXT,
    "confidence" DOUBLE PRECISION,
    "risk" DOUBLE PRECISION,
    "screenshotRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrajectoryStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrajectoryRun" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "goal" TEXT,
    "domain" TEXT,
    "grade" "TrajectoryGrade" NOT NULL DEFAULT 'UNGRADED',
    "outcome" TEXT,
    "score" INTEGER,
    "steps" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrajectoryRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrajectoryStep_sessionId_idx" ON "TrajectoryStep"("sessionId");

-- CreateIndex
CREATE INDEX "TrajectoryStep_userId_idx" ON "TrajectoryStep"("userId");

-- CreateIndex
CREATE INDEX "TrajectoryStep_domain_idx" ON "TrajectoryStep"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "TrajectoryStep_sessionId_stepIndex_key" ON "TrajectoryStep"("sessionId", "stepIndex");

-- CreateIndex
CREATE UNIQUE INDEX "TrajectoryRun_sessionId_key" ON "TrajectoryRun"("sessionId");

-- CreateIndex
CREATE INDEX "TrajectoryRun_userId_idx" ON "TrajectoryRun"("userId");

-- CreateIndex
CREATE INDEX "TrajectoryRun_grade_idx" ON "TrajectoryRun"("grade");
