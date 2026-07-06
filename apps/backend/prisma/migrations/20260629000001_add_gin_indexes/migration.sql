-- Add GIN indexes for full-text search on memory content fields.
-- Replaces LIKE-based search with proper PostgreSQL full-text + trigram search.
-- Covers Memory (user episodic/semantic/procedural/working memories) and
-- AgentMemory (autonomous agent key-value memory store).
--
-- NOTE: created WITHOUT `CONCURRENTLY` on purpose. Prisma Migrate runs each
-- migration inside a transaction, and PostgreSQL forbids
-- `CREATE INDEX CONCURRENTLY` inside a transaction block — using it here would
-- abort `prisma migrate deploy`. These tables are small at this stage so a brief
-- build-time lock is acceptable. If they grow large, drop and rebuild these
-- indexes CONCURRENTLY by hand during a maintenance window.

-- Enable pg_trgm extension for trigram similarity search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Memory table ────────────────────────────────────────────────────────────

-- tsvector GIN index: powers to_tsvector() full-text queries on Memory.content
CREATE INDEX IF NOT EXISTS "Memory_content_gin_idx"
  ON "Memory" USING gin(to_tsvector('english', "content"));

-- trigram GIN index: powers ILIKE / similarity() queries on Memory.content
CREATE INDEX IF NOT EXISTS "Memory_content_trgm_idx"
  ON "Memory" USING gin("content" gin_trgm_ops);

-- tsvector GIN index on Memory.summary (nullable — filter NULLs)
CREATE INDEX IF NOT EXISTS "Memory_summary_gin_idx"
  ON "Memory" USING gin(to_tsvector('english', "summary"))
  WHERE "summary" IS NOT NULL;

-- ─── AgentMemory table ───────────────────────────────────────────────────────

-- tsvector GIN index: powers full-text queries on AgentMemory.content
CREATE INDEX IF NOT EXISTS "AgentMemory_content_gin_idx"
  ON "AgentMemory" USING gin(to_tsvector('english', "content"));

-- trigram GIN index: powers ILIKE / similarity() queries on AgentMemory.content
CREATE INDEX IF NOT EXISTS "AgentMemory_content_trgm_idx"
  ON "AgentMemory" USING gin("content" gin_trgm_ops);

-- trigram GIN index on AgentMemory.key (short string, trgm beats FTS here)
CREATE INDEX IF NOT EXISTS "AgentMemory_key_trgm_idx"
  ON "AgentMemory" USING gin("key" gin_trgm_ops);
