const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const QUERIES = {
  'findUser': () => prisma.user.findFirst({ where: { email: { not: undefined } } }),
  'listUsers': () => prisma.user.findMany({ take: 50 }),
  'countTasks': () => prisma.task.count(),
  'recentMemories': () => prisma.memory.findMany({ take: 20, orderBy: { createdAt: 'desc' } }),
  'activeSessions': () => prisma.executionSession.findMany({ where: { status: { not: 'COMPLETED' } }, take: 20 }),
  'userWithQuota': () => prisma.user.findFirst({ include: { quota: true } }),
  'taskWithSteps': () => prisma.task.findFirst({ include: { steps: true } }),
  'auditLogsRecent': () => prisma.auditLog.findMany({ take: 50, orderBy: { createdAt: 'desc' } }),
  'memoryByType': () => prisma.memory.groupBy({ by: ['type'], _count: true }),
};

async function run() {
  const WARMUP = 10;
  const ITERATIONS = 100;
  const CONCURRENCY = [1, 5, 10, 25, 50];

  console.log('=== Database Query Performance Benchmark ===\n');
  console.log(`Warmup: ${WARMUP} iterations per query`);
  console.log(`Measure: ${ITERATIONS} iterations per query\n`);

  for (const [name, query] of Object.entries(QUERIES)) {
    console.log(`\n--- ${name} ---`);

    for (let i = 0; i < WARMUP; i++) {
      try { await query(); } catch { /* warmup */ }
    }

    for (const concurrency of CONCURRENCY) {
      const totalOps = ITERATIONS;
      const batchSize = concurrency;
      const batches = Math.ceil(totalOps / batchSize);
      let totalTime = 0;
      let successCount = 0;

      for (let b = 0; b < batches; b++) {
        const batchPromises = [];
        const batchSizeActual = Math.min(batchSize, totalOps - b * batchSize);
        const batchStart = Date.now();

        for (let i = 0; i < batchSizeActual; i++) {
          batchPromises.push(
            query()
              .then(() => { successCount++; })
              .catch(() => {})
          );
        }

        await Promise.all(batchPromises);
        totalTime += Date.now() - batchStart;
      }

      const avgTime = totalTime / batches;
      const throughput = (successCount / (totalTime / 1000)).toFixed(2);
      console.log(`  concurrency=${concurrency.toString().padStart(2)}  avg=${avgTime.toFixed(0).padStart(4)}ms/batch  throughput=${throughput.padStart(8)}ops/sec  success=${successCount}/${totalOps}`);
    }
  }

  await prisma.$disconnect();
}

run().catch(console.error);
