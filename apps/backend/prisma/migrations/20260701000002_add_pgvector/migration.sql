-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Change AgentMemory.embedding from double precision[] to vector(1536)
-- The USING clause casts existing float arrays to vector type.
ALTER TABLE "AgentMemory" ALTER COLUMN "embedding" TYPE vector(1536) USING "embedding"::vector;

-- IVFFlat index for approximate nearest-neighbor search (cosine distance)
-- 100 lists is a good default for up to ~1M vectors.
CREATE INDEX IF NOT EXISTS idx_agent_memory_embedding
  ON "AgentMemory"
  USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);
