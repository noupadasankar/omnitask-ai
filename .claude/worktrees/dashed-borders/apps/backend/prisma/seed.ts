import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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
