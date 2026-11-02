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
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('Database schema applied / verified.');
  } catch (err) {
    console.error('Auto-migration warning:', err.message);
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
