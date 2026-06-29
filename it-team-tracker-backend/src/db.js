// Database connection pool using pg
const { Pool } = require('pg');

// Zeabur exposes POSTGRES_CONNECTION_STRING; fall back to DATABASE_URL for local dev
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_CONNECTION_STRING;

// Zeabur internal PostgreSQL does NOT use SSL.
// Only enable SSL if explicitly requested via PGSSLMODE env var.
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
