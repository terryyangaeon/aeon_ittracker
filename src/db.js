const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_CONNECTION_STRING;

const useSSL = process.env.PGSSLMODE === 'require';

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected pool error:', err.message);
});

module.exports = pool;
