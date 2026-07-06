const Redis = require('ioredis');
const Bull = require('bull');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function benchmarkRedisOperations() {
  const redis = new Redis(REDIS_URL);

  const OPERATIONS = ['set', 'get', 'lpush+lpop', 'hset+hget', 'sadd+smembers'];

  const WARMUP = 50;
  const ITERATIONS = 1000;
  const CONCURRENCY = [1, 10, 50];

  console.log('=== Redis Operation Performance Benchmark ===\n');
  console.log(`Warmup: ${WARMUP} iterations`);
  console.log(`Measure: ${ITERATIONS} iterations\n`);

  for (const op of OPERATIONS) {
    console.log(`\n--- ${op} ---`);

    for (let i = 0; i < WARMUP; i++) {
      try {
        switch (op) {
          case 'set': await redis.set(`warmup:${i}`, 'x'); break;
          case 'get': await redis.get('warmup:0'); break;
          case 'lpush+lpop': await redis.lpush(`warmupq:${i}`, 'x'); await redis.rpop(`warmupq:${i}`); break;
          case 'hset+hget': await redis.hset(`warmuph:${i}`, 'field', 'x'); await redis.hget(`warmuph:${i}`, 'field'); break;
          case 'sadd+smembers': await redis.sadd(`warmups:${i}`, 'x'); await redis.smembers(`warmups:${i}`); break;
        }
      } catch { /* warmup */ }
    }

    for (const concurrency of CONCURRENCY) {
      const totalOps = ITERATIONS;
      const batchSize = concurrency;
      const batches = Math.ceil(totalOps / batchSize);
      let totalTime = 0;
      let successCount = 0;

      for (let b = 0; b < batches; b++) {
        const batchPromises = [];
        const actual = Math.min(batchSize, totalOps - b * batchSize);
        const batchStart = Date.now();

        for (let i = 0; i < actual; i++) {
          const idx = b * batchSize + i;
          const promise = (async () => {
            try {
              switch (op) {
                case 'set': await redis.set(`bench:set:${idx}`, 'x'); break;
                case 'get': await redis.get(`bench:set:0`); break;
                case 'lpush+lpop': await redis.lpush(`bench:q:${idx}`, 'x'); await redis.rpop(`bench:q:${idx}`); break;
                case 'hset+hget': await redis.hset(`bench:h:${idx}`, 'f', 'x'); await redis.hget(`bench:h:${idx}`, 'f'); break;
                case 'sadd+smembers': await redis.sadd(`bench:s:${idx}`, `m${idx}`); await redis.smembers(`bench:s:${idx}`); break;
              }
              successCount++;
            } catch { /* ignore */ }
          })();
          batchPromises.push(promise);
        }

        await Promise.all(batchPromises);
        totalTime += Date.now() - batchStart;
      }

      const avgTime = totalTime / batches;
      const throughput = (successCount / (totalTime / 1000)).toFixed(0);
      console.log(`  concurrency=${concurrency.toString().padStart(2)}  avg=${avgTime.toFixed(0).padStart(4)}ms/batch  throughput=${throughput.padStart(8)}ops/sec  success=${successCount}/${totalOps}`);
    }
  }

  await redis.quit();
}

async function benchmarkBullQueue() {
  const queue = new Bull('benchmark-queue', REDIS_URL);

  const ITERATIONS = 500;
  const CONCURRENCY = [1, 5, 10];

  console.log('\n=== Bull Queue Performance Benchmark ===\n');
  console.log(`Measure: ${ITERATIONS} jobs\n`);

  let processedCount = 0;
  queue.process(async (job) => {
    processedCount++;
    return { processed: true };
  });

  for (const concurrency of CONCURRENCY) {
    processedCount = 0;
    const batchSize = concurrency;
    const batches = Math.ceil(ITERATIONS / batchSize);
    let totalTime = 0;

    for (let b = 0; b < batches; b++) {
      const actual = Math.min(batchSize, ITERATIONS - b * batchSize);
      const batchStart = Date.now();
      const jobs = [];

      for (let i = 0; i < actual; i++) {
        jobs.push(queue.add({ data: `job-${b}-${i}` }));
      }

      await Promise.all(jobs);
      await new Promise((resolve) => {
        const check = setInterval(() => {
          if (processedCount >= (b + 1) * batchSize) {
            clearInterval(check);
            resolve();
          }
        }, 10);
        setTimeout(() => { clearInterval(check); resolve(); }, 5000);
      });

      totalTime += Date.now() - batchStart;
    }

    const avgTime = totalTime / batches;
    const throughput = (processedCount / (totalTime / 1000)).toFixed(0);
    console.log(`  concurrency=${concurrency.toString().padStart(2)}  avg=${avgTime.toFixed(0).padStart(4)}ms/batch  throughput=${throughput.padStart(8)}jobs/sec  processed=${processedCount}/${ITERATIONS}`);
  }

  await queue.close();
}

async function main() {
  console.log('========================================');
  console.log('  Redis & Queue Performance Benchmark');
  console.log('========================================\n');
  console.log(`Redis URL: ${REDIS_URL}\n`);

  await benchmarkRedisOperations();
  await benchmarkBullQueue();

  console.log('\nDone.');
}

main().catch(console.error);
