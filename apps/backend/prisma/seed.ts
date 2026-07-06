import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';

function buildPool(): Pool {
  const url = new URL(process.env.DATABASE_URL!);
  const ssl = url.searchParams.has('sslmode') ? { rejectUnauthorized: false } : undefined;
  url.searchParams.delete('sslmode');
  return new Pool({ connectionString: url.toString(), ssl });
}

const pool = buildPool();
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash('demo12345', 10);
  const resetAt = new Date();
  resetAt.setHours(24, 0, 0, 0);

  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@omnitask.ai' },
    update: {},
    create: {
      email: 'demo@omnitask.ai',
      passwordHash,
      name: 'Demo User',
      role: 'USER',
      emailVerified: true,
      quota: {
        create: {
          plan: 'FREE',
          resetAt,
        },
      },
      preferences: {
        create: {},
      },
    },
  });

  console.log(`Seed complete. Demo user: demo@omnitask.ai / demo12345 (id: ${demoUser.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
