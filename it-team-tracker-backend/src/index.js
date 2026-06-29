// IT Team Tracker — Backend API
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// --------------- Middleware ---------------
app.use(cors({
  origin: process.env.CORS_ORIGINS === '*'
    ? '*'
    : (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));
app.use(express.json({ limit: '1mb' }));

// --------------- Auto-migrate on startup ---------------
async function autoMigrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('Database schema applied / verified.');
  } catch (err) {
    console.error('Auto-migration warning:', err.message);
    // Non-fatal — tables may already exist
  } finally {
    client.release();
  }
}

// --------------- Routes ---------------
const recordsRouter  = require('./routes/records');
const objectivesRouter = require('./routes/objectives');
const weeklyRouter   = require('./routes/weekly');

// The frontend calls /records, /objectives, /weekly directly
// (the user enters a base URL like https://xxx.zeabur.app/api)
// We mount under /api so the full paths are /api/records, etc.
// But we also mount at root / to be flexible.
app.use('/api/records',    recordsRouter);
app.use('/api/objectives', objectivesRouter);
app.use('/api/weekly',     weeklyRouter);

// Also mount at root for simpler URL configuration
app.use('/records',    recordsRouter);
app.use('/objectives', objectivesRouter);
app.use('/weekly',     weeklyRouter);

// Health check
app.get('/', (req, res) => {
  res.json({
    service: 'IT Team Tracker API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      records:    'GET /records, POST /records',
      objectives: 'GET /objectives, POST /objectives, PUT /objectives/:id, DELETE /objectives/:id',
      weekly:     'GET /weekly, POST /weekly',
    },
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// --------------- Start ---------------
async function start() {
  await autoMigrate();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`IT Team Tracker API running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
