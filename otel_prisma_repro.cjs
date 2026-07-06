const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

const sdk = new NodeSDK({ instrumentations: [getNodeAutoInstrumentations()] });
sdk.start();

require('dotenv').config({ path: __dirname + '/.env' });
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const { PrismaClient } = require('@prisma/client');

function buildPool() {
  const url = new URL(process.env.DATABASE_URL);
  const ssl = url.searchParams.has('sslmode') ? { rejectUnauthorized: false } : undefined;
  url.searchParams.delete('sslmode');
  return new Pool({ connectionString: url.toString(), ssl });
}

const adapter = new PrismaPg(buildPool());
const prisma = new PrismaClient({ adapter });

prisma.$connect().then(() => {
  console.log('REPRO: PRISMA CONNECTED OK (bug did not reproduce)');
  process.exit(0);
}).catch(err => {
  console.log('REPRO: PRISMA CONNECT FAILED:', err.constructor.name, err.message);
  console.log(err.stack);
  process.exit(1);
});
