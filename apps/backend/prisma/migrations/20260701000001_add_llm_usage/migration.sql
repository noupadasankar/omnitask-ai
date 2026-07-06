-- Create LlmUsage table for token/cost tracking
CREATE TABLE "LlmUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "taskId" TEXT,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "cost" DOUBLE PRECISION,
    "durationMs" INTEGER,
    "endpoint" TEXT NOT NULL DEFAULT 'chat',
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LlmUsage_userId_createdAt_idx" ON "LlmUsage"("userId", "createdAt" DESC);
CREATE INDEX "LlmUsage_createdAt_idx" ON "LlmUsage"("createdAt");
CREATE INDEX "LlmUsage_model_idx" ON "LlmUsage"("model");
