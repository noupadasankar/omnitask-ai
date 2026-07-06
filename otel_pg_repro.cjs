const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

const sdk = new NodeSDK({ instrumentations: [getNodeAutoInstrumentations()] });
sdk.start();

require('dotenv').config({ path: __dirname + '/.env' });
const { Pool } = require('pg');
const url = new URL(process.env.DATABASE_URL);
const ssl = url.searchParams.has('sslmode') ? { rejectUnauthorized: false } : undefined;
url.searchParams.delete('sslmode');
const pool = new Pool({ connectionString: url.toString(), ssl });

pool.connect().then(c => {
  console.log('REPRO: CONNECTED OK (bug did not reproduce)');
  c.release();
  process.exit(0);
}).catch(err => {
  console.log('REPRO: CONNECT FAILED:', err.constructor.name, err.message);
  process.exit(1);
});
