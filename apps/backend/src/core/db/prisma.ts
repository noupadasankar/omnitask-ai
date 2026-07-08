// apps/backend/src/core/db/prisma.ts
//
// Shared Prisma client for Express+Inversify-migrated modules. Reuses the
// exact connection setup as the NestJS-era PrismaService (adapter-pg pool,
// same DATABASE_URL parsing) so both DI graphs talk to the same pool during
// the migration — no duplicate connections, no behavior drift.

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

function buildPool(): Pool {
  const url = new URL(process.env.DATABASE_URL!);
  const ssl = url.searchParams.has('sslmode') ? { rejectUnauthorized: false } : undefined;
  url.searchParams.delete('sslmode');
  return new Pool({ connectionString: url.toString(), ssl });
}

let client: PrismaClient | null = null;

/** Lazily-constructed singleton PrismaClient for migrated modules. */
export function getPrismaClient(): PrismaClient {
  if (!client) {
    const adapter = new PrismaPg(buildPool());
    client = new PrismaClient({ adapter });
  }
  return client;
}
