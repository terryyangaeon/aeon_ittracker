const { Router } = require('express');
const pool = require('../db');

const router = Router();

// GET / — return all daily records sorted by date DESC
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, member, date, site, tasks, deliverables, submitted_by, created_at FROM daily_records ORDER BY date DESC, created_at DESC'
    );
    res.json({ records: rows });
  } catch (err) {
    console.error('GET /records error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST / — create a new daily entry
router.post('/', async (req, res) => {
  try {
    const { member, date, site, tasks, deliverables, submittedBy } = req.body;
    if (!member || !date) {
      return res.status(400).json({ error: 'member and date are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO daily_records (member, date, site, tasks, deliverables, submitted_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [member, date, site || null, tasks || null, deliverables || null, submittedBy || member]
    );
    res.status(201).json({ record: rows[0] });
  } catch (err) {
    console.error('POST /records error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
