-- Run this file after Prisma migrations complete
-- These indexes provide performance optimizations not definable in Prisma schema

-- Example: Trigram index for fuzzy text search on task titles
-- CREATE INDEX CONCURRENTLY idx_tasks_title_trgm ON tasks USING gin (title gin_trgm_ops);

-- Example: Vector similarity index for embeddings
-- CREATE INDEX CONCURRENTLY idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_l2_ops);

-- Example: Composite index for common query patterns
-- CREATE INDEX CONCURRENTLY idx_tasks_user_status ON tasks (userId, status);

-- Add your application-specific indexes here after migrations run
