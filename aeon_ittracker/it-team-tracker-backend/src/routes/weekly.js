const { Router } = require('express');
const pool = require('../db');

const router = Router();

// GET / — return all weekly PPP entries
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, member, week_ending AS "weekEnding", progress, plans, problems, last_updated_at AS "lastUpdatedAt" FROM weekly_ppp ORDER BY week_ending DESC, member'
    );
    res.json({ weekly: rows });
  } catch (err) {
    console.error('GET /weekly error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST / — create or upsert a weekly PPP entry
router.post('/', async (req, res) => {
  try {
    const { member, weekEnding, progress, plans, problems } = req.body;
    if (!member || !weekEnding) {
      return res.status(400).json({ error: 'member and weekEnding are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO weekly_ppp (member, week_ending, progress, plans, problems, last_updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (member, week_ending) DO UPDATE
         SET progress = EXCLUDED.progress,
             plans = EXCLUDED.plans,
             problems = EXCLUDED.problems,
             last_updated_at = now()
       RETURNING id, member, week_ending AS "weekEnding", progress, plans, problems, last_updated_at AS "lastUpdatedAt"`,
      [member, weekEnding, progress || '', plans || '', problems || '']
    );
    res.status(201).json({ entry: rows[0] });
  } catch (err) {
    console.error('POST /weekly error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
