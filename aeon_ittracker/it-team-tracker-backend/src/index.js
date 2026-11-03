require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const pool = require('./db');

const sso = require('./lib/sso');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);

app.use(cors({
  origin: process.env.CORS_ORIGINS === '*'
    ? '*'
    : (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '50mb' }));

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

app.use('/api/auth',       require('./routes/auth'));
app.use('/api/config',     require('./routes/config'));
app.use('/api/entries',    require('./routes/entries'));
app.use('/api/objectives', require('./routes/objectives'));
app.use('/api/dashboard',  require('./routes/dashboard'));
app.use('/api/backup',       require('./routes/backup'));
app.use('/api/email-alerts', require('./routes/email-alerts'));
app.use('/api/suggestions',  require('./routes/suggestions'));
app.use('/api/skills',       require('./routes/skills'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve frontend static files
const publicDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, {
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
  console.log('Serving frontend from', publicDir);
}

async function start() {
  await autoMigrate();
  await sso.init();
  console.log('Microsoft sign-in ' + (sso.enabled() ? 'enabled' : 'not configured'));

  // Schedule email alert check every minute
  const { checkAndSendScheduledAlerts } = require('./routes/email-alerts');
  cron.schedule('* * * * *', () => {
    checkAndSendScheduledAlerts();
  }, { timezone: 'Asia/Hong_Kong' });
  console.log('Email alert scheduler started (Asia/Hong_Kong timezone).');

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`IT Team Tracker API v2 running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
