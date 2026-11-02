require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));

async function autoMigrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  // Split on semicolons that end a statement (handles DO $$ blocks)
  const statements = [];
  let current = '';
  let inDollarBlock = false;
  for (const line of sql.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') && !inDollarBlock) continue;
    if (trimmed.includes('$$')) {
      inDollarBlock = !inDollarBlock;
    }
    current += line + '\n';
    if (!inDollarBlock && trimmed.endsWith(';')) {
      const stmt = current.trim();
      if (stmt && stmt !== ';') statements.push(stmt);
      current = '';
    }
  }
  if (current.trim()) statements.push(current.trim());

  const client = await pool.connect();
  try {
    for (const stmt of statements) {
      try {
        await client.query(stmt);
      } catch (err) {
        console.warn('Migration step skipped:', err.message);
      }
    }
    console.log('Database schema applied / verified.');
  } finally {
    client.release();
  }
}

// --- API routes ---
const recordsRouter = require('./routes/records');
const objectivesRouter = require('./routes/objectives');
const weeklyRouter = require('./routes/weekly');

app.use('/api/records', recordsRouter);
app.use('/api/objectives', objectivesRouter);
app.use('/api/weekly', weeklyRouter);
app.use('/records', recordsRouter);
app.use('/objectives', objectivesRouter);
app.use('/weekly', weeklyRouter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// --- Static frontend ---
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: '1h',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

async function start() {
  await autoMigrate();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`IT Team Tracker running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
