-- Run after `prisma db push` or `prisma migrate deploy`
-- These indexes require raw PostgreSQL features not expressible in Prisma schema.

-- 1. pgvector IVFFlat index on AgentMemory.embedding
--    Applied via migration 20260701000002_add_pgvector. Kept here as a reference
--    for fresh `prisma db push` environments where migrations are skipped.
-- DO: ALTER TABLE "AgentMemory" ALTER COLUMN "embedding" TYPE vector(1536) USING "embedding"::vector;
-- DO: CREATE INDEX IF NOT EXISTS idx_agent_memory_embedding ON "AgentMemory" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

-- 2. Full-text search GIN index on Task.title + Task.naturalLanguage
CREATE INDEX IF NOT EXISTS idx_task_fulltext
  ON "Task"
  USING gin (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("naturalLanguage", '')));

-- 3. Full-text search GIN index on Memory.content
CREATE INDEX IF NOT EXISTS idx_memory_fulltext
  ON "Memory"
  USING gin (to_tsvector('english', coalesce("content", '')));

-- 4. Full-text search GIN index on File.name
CREATE INDEX IF NOT EXISTS idx_file_name_fulltext
  ON "File"
  USING gin (to_tsvector('english', coalesce("name", '')));
