require('dotenv').config({ path: __dirname + '/.env' });
const { Pool } = require('pg');
const url = new URL(process.env.DATABASE_URL);
const ssl = url.searchParams.has('sslmode') ? { rejectUnauthorized: false } : undefined;
url.searchParams.delete('sslmode');
const pool = new Pool({ connectionString: url.toString(), ssl });
pool.connect().then(c => {
  console.log('CONNECTED OK');
  const params = c.connectionParameters;
  for (const k of Object.keys(params)) {
    console.log(k, '=>', typeof params[k], JSON.stringify(params[k]).slice(0,80));
  }
  c.release();
  process.exit(0);
}).catch(err => {
  console.log('CONNECT ERROR:', err.message);
  process.exit(1);
});
